/******************************************************************************
 * Original embedded-notes teaching project, 2026. No third-party authorship claimed.
 * @file clock_plan.c
 * @author embedded-notes project
 * @brief Rational nominal arithmetic and finite fake switching. No MMIO.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "clock_plan.h"
#include <stddef.h>
#ifdef CLOCK_PLAN_TEST
#include <stdio.h>
#endif

/** @brief Reduce positive ratio. @param[in] num,den Positive. @return Ratio. */
static ClockRatio ratio(uint64_t num, uint64_t den)
{
    uint64_t a = num;
    uint64_t b = den;
    /** Euclid divides only by nonzero b. **/
    while (b != 0U) {
        uint64_t remainder = a % b;
        a = b;
        b = remainder;
    }
    return (ClockRatio){num / a, den / a};
}

/** @brief Discrete divider test. @param[in] value,ahb Divider and bus. @return 0/1. */
static int divider_valid(uint32_t value, int ahb)
{
    /** Divider encodings are not a continuous interval. **/
    return value == 1U || value == 2U || value == 4U || value == 8U || value == 16U ||
        (ahb != 0 && (value == 64U || value == 128U || value == 256U || value == 512U));
}

/** @brief Check fields and source. @param[in] r Live input. @return Status. */
static ClockStatus request_valid(const ClockRequest *r)
{
    /** Separate malformed fields, physical ranges and a deliberately narrower policy. **/
    if (r->m < 2U || r->m > 63U || r->n < 50U || r->n > 432U ||
        (r->p != 2U && r->p != 4U && r->p != 6U && r->p != 8U) ||
        r->q < 2U || r->q > 15U || !divider_valid(r->ahb, 1) || !divider_valid(r->apb1, 0) ||
        !divider_valid(r->apb2, 0) || (r->scale != 1U && r->scale != 2U) || r->ws > 7U || r->q48 > 1U) {
        return CLOCK_INVALID;
    }
    if ((r->mode == CLOCK_HSI && r->hz != 16000000U) ||
        (r->mode == CLOCK_CRYSTAL && (r->hz < 4000000U || r->hz > 26000000U)) ||
        (r->mode == CLOCK_BYPASS && (r->hz < 1000000U || r->hz > 50000000U)) ||
        (r->mode != CLOCK_HSI && r->mode != CLOCK_CRYSTAL && r->mode != CLOCK_BYPASS)) {
        return CLOCK_DEVICE;
    }
    if (r->mv < 2700U || r->mv > 3600U || r->n < 192U ||
        r->hz < UINT64_C(1000000) * r->m || r->hz > UINT64_C(2000000) * r->m) {
        return CLOCK_POLICY;
    }
    return CLOCK_OK;
}

/**
 * @brief Validate nominal plan transactionally.
 * @param[in] request Live input.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_plan(const ClockRequest *request, ClockPlan *output)
{
    ClockPlan next;
    uint64_t product;
    uint64_t sysDen;
    uint64_t hDen;
    uint32_t minimumWs = 0U;
    const uint32_t upperHz[6] = {30000000U,60000000U,90000000U,120000000U,150000000U,168000000U};
    ClockStatus status;
    /** Guard pointers before reads, and multiplication before execution. **/
    if (request == NULL || output == NULL) {
        return CLOCK_INVALID;
    }
    if (request->n != 0U && request->hz > UINT64_MAX / request->n) {
        return CLOCK_OVERFLOW;
    }
    status = request_valid(request);
    if (status != CLOCK_OK) {
        return status;
    }
    product = request->hz * request->n;
    if (product < UINT64_C(192000000) * request->m || product > UINT64_C(432000000) * request->m) {
        return CLOCK_POLICY;
    }
    /** After bounded fields, denominator products and range cross-products fit uint64_t. **/
    sysDen = (uint64_t)request->m * request->p;
    hDen = sysDen * request->ahb;
    if (product < UINT64_C(24000000) * sysDen || product > UINT64_C(168000000) * sysDen ||
        product > (request->scale == 1U ? UINT64_C(168000000) : UINT64_C(144000000)) * hDen ||
        product > UINT64_C(42000000) * hDen * request->apb1 ||
        product > UINT64_C(84000000) * hDen * request->apb2 ||
        product > UINT64_C(75000000) * request->m * request->q) {
        return CLOCK_DEVICE;
    }
    if (request->q48 != 0U && product != UINT64_C(48000000) * request->m * request->q) {
        return CLOCK_POLICY;
    }
    while (minimumWs < 5U && product > (uint64_t)upperHz[minimumWs] * hDen) {
        minimumWs++;
    }
    if (request->ws < minimumWs) {
        return CLOCK_FLASH;
    }
    next.input = ratio(request->hz, request->m);
    next.vco = ratio(product, request->m);
    next.sys = ratio(product, sysDen);
    next.hclk = ratio(product, hDen);
    next.pclk1 = ratio(product, hDen * request->apb1);
    next.pclk2 = ratio(product, hDen * request->apb2);
    next.timer1 = ratio(product * (request->apb1 == 1U ? 1U : 2U), hDen * request->apb1);
    next.timer2 = ratio(product * (request->apb2 == 1U ? 1U : 2U), hDen * request->apb2);
    next.q = ratio(product, (uint64_t)request->m * request->q);
    next.minimumWs = minimumWs;
    *output = next;
    return CLOCK_OK;
}

/**
 * @brief Exact periodic SysTick.
 * @param[in] source,rateHz Frequency and rate.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_tick(ClockRatio source, uint32_t rateHz, ClockTick *output)
{
    uint64_t denominator;
    uint64_t count;
    /** Count1 encodes LOAD0, which does not generate the normal periodic 1-to-0 event. **/
    if (output == NULL || source.num == 0U || source.den == 0U || rateHz == 0U) {
        return CLOCK_INVALID;
    }
    if (source.den > UINT64_MAX / rateHz) {
        return CLOCK_OVERFLOW;
    }
    denominator = source.den * rateHz;
    count = source.num / denominator;
    if (count == 0U || count > UINT64_C(16777216)) {
        return CLOCK_RANGE;
    }
    if (source.num % denominator != 0U) {
        return CLOCK_INEXACT;
    }
    if (count == 1U) {
        return CLOCK_NO_EVENT;
    }
    *output = (ClockTick){(uint32_t)count, (uint32_t)(count - 1U), {rateHz, 1U}};
    return CLOCK_OK;
}

/**
 * @brief OVER8=0 nearest divisor, ties upward.
 * @param[in] clockHz,baud Hz.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_uart(uint32_t clockHz, uint32_t baud, ClockUart *output)
{
    uint64_t divisor;
    uint64_t denominator;
    ClockUart next;
    /** Reject above-PCLK/16 requests even if rounding would produce divisor16. **/
    if (output == NULL || clockHz == 0U || baud == 0U) {
        return CLOCK_INVALID;
    }
    if ((uint64_t)clockHz < (uint64_t)baud * 16U) {
        return CLOCK_RANGE;
    }
    divisor = clockHz / baud;
    if ((uint64_t)(clockHz % baud) * 2U >= baud) {
        divisor++;
    }
    if (divisor > 65535U) {
        return CLOCK_RANGE;
    }
    denominator = (uint64_t)baud * divisor;
    next.divisor = (uint32_t)divisor;
    next.mantissa = (uint32_t)(divisor / 16U);
    next.fraction = (uint32_t)(divisor % 16U);
    next.brr = (uint32_t)divisor;
    next.achieved = ratio(clockHz, divisor);
    next.errorNum = (int64_t)clockHz - (int64_t)denominator;
    next.errorDen = denominator;
    *output = next;
    return CLOCK_OK;
}

/**
 * @brief Begin fixed up16->168 or down168->84 fixture.
 * @param[in] down,fault,limit Conditions.
 * @param[out] output Live output.
 * @return Status.
 */
ClockStatus clock_switch_begin(uint32_t down, ClockFault fault, uint32_t limit, ClockSwitch *output)
{
    ClockSwitch next = {0};
    /** Both fixtures declare available HSI and disabled PLLI2S, not measured hardware. **/
    if (output == NULL || down > 1U || fault < CLOCK_FAULT_NONE || fault > CLOCK_FAULT_OFF ||
        limit < 1U || limit > 3U) {
        return CLOCK_INVALID;
    }
    next.limit = limit;
    next.down = down;
    next.hclk = down != 0U ? 168000000U : 16000000U;
    next.scale = down != 0U ? 1U : 2U;
    next.ws = down != 0U ? 5U : 0U;
    next.apb1 = down != 0U ? 4U : 1U;
    next.apb2 = down != 0U ? 2U : 1U;
    next.pllOn = down;
    next.hseOn = down;
    next.fault = fault;
    next.source = down != 0U ? "PLL" : "HSI";
    next.event = "SEED";
    next.status = CLOCK_OK;
    *output = next;
    return CLOCK_OK;
}

/** @brief Explicit scripted fallback. @param[in,out] s Begun state. @param[in] status Failure. @return Failure. */
static ClockStatus fallback(ClockSwitch *s, ClockStatus status)
{
    /** Fake fallback has guaranteed HSI/SWS observation; real fallback can also fail. **/
    s->source = "HSI";
    s->hclk = 16000000U;
    s->apb1 = 16U;
    s->apb2 = 16U;
    s->terminal = 1U;
    s->status = status;
    s->event = "FAIL_SAFE_HSI16_CONFIRMED";
    return status;
}

/** @brief One bounded observation. @param[in,out] s Begun state. @param[in] fault,failure Script. @return Status. */
static ClockStatus observe(ClockSwitch *s, ClockFault fault, ClockStatus failure)
{
    /** Nonfault readiness arrives on observation2; attempts have a maximum of3. **/
    s->attempt++;
    if (s->fault != fault && s->attempt >= 2U) {
        s->attempt = 0U;
        s->phase++;
        return CLOCK_OK;
    }
    if (s->attempt >= s->limit) {
        return fallback(s, failure);
    }
    return CLOCK_OK;
}

/** @brief One fake request/observation. @param[in,out] state Previously begun state. @return Status. */
ClockStatus clock_switch_step(ClockSwitch *state)
{
    ClockSwitch *s = state;
    /** Metadata checks supplement, and cannot replace, the live-object caller contract. **/
    if (s == NULL || s->phase > 28U || s->limit < 1U || s->limit > 3U || s->down > 1U ||
        s->fault < CLOCK_FAULT_NONE || s->fault > CLOCK_FAULT_OFF || s->steps > 64U) {
        return CLOCK_INVALID;
    }
    if (s->terminal != 0U) {
        return CLOCK_DONE;
    }
    s->steps++;
    switch (s->phase) {
        case 0:
            s->event = "HSI_ENABLE_REQUEST";
            break;
        case 1:
            s->event = "HSIRDY_OBSERVED_AVAILABLE";
            break;
        case 2:
            s->apb1 = 16U;
            s->apb2 = 16U;
            s->event = "APB16_REQUEST";
            break;
        case 3:
            s->event = "APB16_READBACK";
            break;
        case 4:
            s->event = "SW_HSI_REQUEST";
            break;
        case 5:
            s->source = "HSI";
            s->hclk = 16000000U;
            s->event = "SWS_HSI_OBSERVED";
            break;
        case 6:
            s->pllOn = 0U;
            s->event = "PLL_OFF_REQUEST";
            break;
        case 7:
            s->event = "PLLRDY_CLEAR_OBSERVATION";
            return observe(s, CLOCK_FAULT_OFF, CLOCK_TIMEOUT_OFF);
        case 8:
            s->hseOn = 0U;
            s->event = "HSE_OFF_REQUEST";
            break;
        case 9:
            s->event = "HSERDY_CLEAR_OBSERVATION";
            return observe(s, CLOCK_FAULT_OFF, CLOCK_TIMEOUT_OFF);
        case 10:
            s->event = "HSE_MODE_WRITE_WHILE_OFF";
            break;
        case 11:
            s->hseOn = 1U;
            s->event = "HSE_ENABLE_REQUEST";
            break;
        case 12:
            s->event = "HSERDY_OBSERVATION";
            return observe(s, CLOCK_FAULT_HSE, CLOCK_TIMEOUT_HSE);
        case 13:
            s->scale = 1U;
            s->event = "PWR_CLOCK_VOS1_REQUEST";
            break;
        case 14:
            s->event = "F407_VOSRDY_OBSERVATION";
            return observe(s, CLOCK_FAULT_VOS, CLOCK_TIMEOUT_VOS);
        case 15:
            s->ws = 5U;
            s->event = "FLASH5_REQUEST";
            break;
        case 16:
            s->event = "FLASH5_READBACK";
            if (s->fault == CLOCK_FAULT_READBACK) {
                return fallback(s, CLOCK_READBACK);
            }
            break;
        case 17:
            if (s->pllOn != 0U || s->plli2sOn != 0U) {
                return fallback(s, CLOCK_INVALID);
            }
            s->event = "PLL_CONFIG_M8_N336_P2_OR4_Q7_WHILE_OFF";
            break;
        case 18:
            s->pllOn = 1U;
            s->event = "PLL_ENABLE_REQUEST";
            break;
        case 19:
            s->event = "PLLRDY_OBSERVATION";
            return observe(s, CLOCK_FAULT_PLL, CLOCK_TIMEOUT_PLL);
        case 20:
            s->event = "HPRE1_READBACK_APB16_HELD";
            break;
        case 21:
            s->event = "SW_PLL_REQUEST";
            break;
        case 22:
            s->event = "SWS_PLL_OBSERVATION";
            if (observe(s, CLOCK_FAULT_SWITCH, CLOCK_TIMEOUT_SWITCH) != CLOCK_OK) {
                return s->status;
            }
            if (s->attempt == 0U) {
                s->source = "PLL";
                s->hclk = s->down != 0U ? 84000000U : 168000000U;
            }
            return CLOCK_OK;
        case 23:
            s->apb1 = s->down != 0U ? 2U : 4U;
            s->apb2 = s->down != 0U ? 1U : 2U;
            s->event = "FINAL_APB_REQUEST";
            break;
        case 24:
            s->event = "FINAL_APB_READBACK";
            break;
        case 25:
            s->ws = s->down != 0U ? 2U : 5U;
            s->event = "FINAL_FLASH_REQUEST_AFTER_SWS";
            break;
        case 26:
            s->event = "FINAL_FLASH_READBACK";
            break;
        case 27:
            s->scale = s->down != 0U ? 2U : 1U;
            s->event = s->down != 0U ? "VOS2_REQUEST_AFTER_HCLK84" : "VOS1_RETAINED";
            break;
        case 28:
            s->event = "FINAL_F407_VOSRDY_OBSERVATION";
            if (observe(s, CLOCK_FAULT_VOS, CLOCK_TIMEOUT_VOS) != CLOCK_OK) {
                return s->status;
            }
            if (s->attempt == 0U) {
                s->phase = 28U;
                s->terminal = 1U;
                s->event = "SUCCESS_TARGET_CONFIRMED";
            }
            return CLOCK_OK;
        default:
            return CLOCK_INVALID;
    }
    s->phase++;
    return CLOCK_OK;
}

/** @brief Status name. @param[in] status Enum. @return Static string. */
const char *clock_status_name(ClockStatus status)
{
    static const char *const names[] = {"OK","INVALID","OVERFLOW","POLICY","DEVICE","FLASH",
        "INEXACT","RANGE","NO_EVENT","DONE","TIMEOUT_HSE","TIMEOUT_PLL","TIMEOUT_SWITCH",
        "READBACK","TIMEOUT_VOS","TIMEOUT_OFF"};
    /** Unsigned check covers negative enum casts. **/
    if ((unsigned int)status >= sizeof(names) / sizeof(names[0])) {
        return "UNKNOWN";
    }
    return names[status];
}

#ifdef CLOCK_PLAN_TEST
/** @brief Active expectation. @param[in] ok,label Expectation. @return 0/1. */
static int expect(int ok, const char *label)
{
    /** All fallible I/O is checked immediately, including flush. **/
    if (!ok) {
        if (fprintf(stderr, "FAIL unit09: %s\n", label) < 0) {
            return 0;
        }
        if (fflush(stderr) != 0) {
            return 0;
        }
        return 0;
    }
    return 1;
}

/** @brief Fixed arithmetic and failure fixtures. @param[in] None. @return 0/1. */
static int test_calculations(void)
{
    ClockRequest r = {8000000,8,336,2,7,1,4,2,3300,1,5,1,CLOCK_CRYSTAL};
    ClockPlan p = {0};
    ClockTick t = {0};
    ClockUart u = {0};
    /** Literal expectations come from independent worked cases. **/
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.input.num == 1000000U && p.input.den == 1U &&
        p.vco.num == 336000000U && p.hclk.num == 168000000U && p.hclk.den == 1U &&
        p.pclk1.num == 42000000U && p.pclk2.num == 84000000U && p.timer1.num == 84000000U &&
        p.q.num == 48000000U && p.minimumWs == 5U, "168/42/84 literal")) {
        return 0;
    }
    r.ws = 4U;
    if (!expect(clock_plan(&r,&p) == CLOCK_FLASH && p.hclk.num == 168000000U, "Flash rejection preserves")) {
        return 0;
    }
    r.ws = 5U;
    r.hz = UINT64_MAX;
    if (!expect(clock_plan(&r,&p) == CLOCK_OVERFLOW && p.hclk.num == 168000000U, "multiply guard")) {
        return 0;
    }
    if (!expect(clock_plan(NULL,&p) == CLOCK_INVALID && clock_plan(&r,NULL) == CLOCK_INVALID, "NULL guards")) {
        return 0;
    }
    if (!expect(clock_tick((ClockRatio){168000000,1},1000,&t) == CLOCK_OK &&
        t.count == 168000U && t.load == 167999U, "tick literal")) {
        return 0;
    }
    if (!expect(clock_tick((ClockRatio){16777216,1},1,&t) == CLOCK_OK && t.load == 16777215U &&
        clock_tick((ClockRatio){16777217,1},1,&t) == CLOCK_RANGE && t.load == 16777215U &&
        clock_tick((ClockRatio){1,1},1,&t) == CLOCK_NO_EVENT && t.load == 16777215U &&
        clock_tick((ClockRatio){1,1},2,&t) == CLOCK_RANGE &&
        clock_tick((ClockRatio){10,1},3,&t) == CLOCK_INEXACT &&
        clock_tick((ClockRatio){1,UINT64_MAX},2,&t) == CLOCK_OVERFLOW &&
        clock_tick((ClockRatio){2,1},1,&t) == CLOCK_OK && t.load == 1U, "tick boundary statuses")) {
        return 0;
    }
    if (!expect(clock_uart(42000000U,115200U,&u) == CLOCK_OK && u.divisor == 365U &&
        u.brr == 0x016DU && u.mantissa == 22U && u.fraction == 13U && u.achieved.num == 8400000U &&
        u.achieved.den == 73U && u.errorNum == -48000 && u.errorDen == 42048000U, "UART rational")) {
        return 0;
    }
    if (!expect(clock_uart(165U,10U,&u) == CLOCK_OK && u.divisor == 17U &&
        clock_uart(160U,10U,&u) == CLOCK_OK && u.divisor == 16U &&
        clock_uart(65535U,1U,&u) == CLOCK_OK && u.divisor == 65535U &&
        clock_uart(65536U,1U,&u) == CLOCK_RANGE && u.divisor == 65535U &&
        clock_uart(159U,10U,&u) == CLOCK_RANGE && u.divisor == 65535U &&
        clock_uart(1U,0U,&u) == CLOCK_INVALID && clock_uart(1U,1U,NULL) == CLOCK_INVALID, "UART bounds/tie")) {
        return 0;
    }
    return 1;
}

/** @brief Compare named report fields, never padding. @param[in] a,b Reports. @return 0/1. */
static int same_plan(const ClockPlan *a, const ClockPlan *b)
{
    const ClockRatio left[] = {a->input,a->vco,a->sys,a->hclk,a->pclk1,a->pclk2,a->timer1,a->timer2,a->q};
    const ClockRatio right[] = {b->input,b->vco,b->sys,b->hclk,b->pclk1,b->pclk2,b->timer1,b->timer2,b->q};
    /** Struct assignment need not preserve padding bytes. **/
    for (size_t i = 0U; i < 9U; i++) {
        if (left[i].num != right[i].num || left[i].den != right[i].den) {
            return 0;
        }
    }
    return a->minimumWs == b->minimumWs;
}

/** @brief Discrete domains, exact limits and rejected output snapshots. @param[in] None. @return 0/1. */
static int test_domains(void)
{
    const ClockRequest seed = {8000000,8,336,2,7,1,4,2,3300,1,5,1,CLOCK_CRYSTAL};
    const uint32_t ahb[] = {1,2,4,8,16,64,128,256,512};
    const uint32_t hclk[] = {168000000,84000000,42000000,21000000,10500000,2625000,1312500,656250,328125};
    const uint32_t apb[] = {1,2,4,8,16};
    const uint32_t pclk[] = {21000000,10500000,5250000,2625000,1312500};
    const uint32_t timer[] = {21000000,21000000,10500000,5250000,2625000};
    const uint32_t pllP[] = {2,4,6,8};
    const uint32_t sys[] = {168000000,84000000,56000000,42000000};
    const uint32_t flashN[] = {240,240,360,240,300,336};
    const uint32_t flashP[] = {8,4,4,2,2,2};
    ClockRequest r;
    ClockPlan p = {0};
    ClockPlan before;
    /** Literal tables cover every discrete alternative through the public interface. **/
    for (size_t i = 0U; i < 9U; i++) {
        r = seed;
        r.ahb = ahb[i];
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == hclk[i] && p.hclk.den == 1U,
            "all AHB alternatives")) {
            return 0;
        }
    }
    for (size_t i = 0U; i < 5U; i++) {
        r = seed;
        r.ahb = 8U;
        r.apb1 = apb[i];
        r.apb2 = apb[i];
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.pclk1.num == pclk[i] &&
            p.pclk2.num == pclk[i] && p.timer1.num == timer[i], "all APB alternatives")) {
            return 0;
        }
    }
    for (size_t i = 0U; i < 4U; i++) {
        r = seed;
        r.p = pllP[i];
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.sys.num == sys[i], "all PLLP alternatives")) {
            return 0;
        }
    }
    for (uint32_t q = 2U; q <= 15U; q++) {
        r = seed;
        r.q48 = 0U;
        r.q = q;
        before = p;
        if (!expect(clock_plan(&r,&p) == (q < 5U ? CLOCK_DEVICE : CLOCK_OK) &&
            (q >= 5U || same_plan(&p,&before)), "all PLLQ alternatives and75MHz bound")) {
            return 0;
        }
    }
    for (uint32_t ws = 0U; ws < 6U; ws++) {
        r = seed;
        r.n = flashN[ws];
        r.p = flashP[ws];
        r.ws = ws;
        r.q48 = 0U;
        if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.minimumWs == ws, "Flash exact boundary")) {
            return 0;
        }
        before = p;
        r.hz++;
        if (!expect(clock_plan(&r,&p) == (ws == 5U ? CLOCK_DEVICE : CLOCK_FLASH) && same_plan(&p,&before),
            "Flash above boundary preserves every field")) {
            return 0;
        }
    }
    r = seed;
    r.n = 288U;
    r.q = 6U;
    r.scale = 2U;
    r.ws = 4U;
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == 144000000U, "Scale2 equality")) {
        return 0;
    }
    before = p;
    r.hz++;
    if (!expect(clock_plan(&r,&p) == CLOCK_DEVICE && same_plan(&p,&before), "Scale2 above maximum")) {
        return 0;
    }
    r = seed;
    r.hz = 4194304U;
    r.m = 4U;
    r.n = 256U;
    r.ahb = 8U;
    r.q48 = 0U;
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == 16777216U, "full plan tick maximum")) {
        return 0;
    }
    r.hz = 16777217U;
    r.m = 16U;
    if (!expect(clock_plan(&r,&p) == CLOCK_OK && p.hclk.num == 16777217U &&
        p.input.num == 16777217U && p.input.den == 16U, "rational intermediate preserved")) {
        return 0;
    }
    return 1;
}

/** @brief Initialized invalid requests preserve every output field. @param[in] None. @return 0/1. */
static int test_rejections(void)
{
    const ClockRequest seed = {8000000,8,336,2,7,1,4,2,3300,1,5,1,CLOCK_CRYSTAL};
    const ClockStatus expected[] = {CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,
        CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,
        CLOCK_INVALID,CLOCK_INVALID,CLOCK_INVALID,CLOCK_DEVICE,CLOCK_DEVICE,CLOCK_DEVICE,
        CLOCK_POLICY,CLOCK_POLICY,CLOCK_POLICY,CLOCK_POLICY,CLOCK_POLICY,CLOCK_DEVICE,
        CLOCK_DEVICE,CLOCK_DEVICE,CLOCK_OVERFLOW,CLOCK_FLASH,CLOCK_POLICY,CLOCK_DEVICE};
    ClockRequest cases[28];
    ClockPlan p = {0};
    ClockPlan before;
    /** Fault fixtures are full initialized copies, not invented addresses or spans. **/
    for (size_t i = 0U; i < 28U; i++) {
        cases[i] = seed;
    }
    cases[0].m = 0U;
    cases[1].m = 64U;
    cases[2].n = 49U;
    cases[3].n = 433U;
    cases[4].p = 3U;
    cases[5].q = 1U;
    cases[6].q = 16U;
    cases[7].ahb = 32U;
    cases[8].apb1 = 3U;
    cases[9].apb2 = 32U;
    cases[10].scale = 3U;
    cases[11].ws = 8U;
    cases[12].q48 = 2U;
    cases[13].apb1 = 2U;
    cases[14].apb2 = 1U;
    cases[15].scale = 2U;
    cases[16].mv = 2699U;
    cases[17].mv = 3601U;
    cases[18].n = 100U;
    cases[19].hz = 7999999U;
    cases[20].hz = 16000001U;
    cases[21].hz = 26000001U;
    cases[22].mode = CLOCK_HSI;
    cases[23].mode = (ClockSource)3;
    cases[24].hz = UINT64_MAX;
    cases[25].ws = 4U;
    cases[26].q = 6U;
    cases[27].hz = 0U;
    if (!expect(clock_plan(&seed,&p) == CLOCK_OK, "rejection accepted seed")) {
        return 0;
    }
    before = p;
    for (size_t i = 0U; i < 28U; i++) {
        if (!expect(clock_plan(&cases[i],&p) == expected[i] && same_plan(&p,&before),
            "rejected plan all named output fields preserved")) {
            return 0;
        }
    }
    return 1;
}

/** @brief Actual fake backend success and injected failures. @param[in] None. @return 0/1. */
static int test_switch(void)
{
    const ClockStatus failures[] = {CLOCK_OK,CLOCK_TIMEOUT_HSE,CLOCK_TIMEOUT_PLL,CLOCK_TIMEOUT_SWITCH,
        CLOCK_READBACK,CLOCK_TIMEOUT_VOS,CLOCK_TIMEOUT_OFF};
    /** Exercise both directions without fabricated pointers or a target instruction. **/
    for (uint32_t down = 0U; down < 2U; down++) {
        for (uint32_t f = 0U; f < 7U; f++) {
            ClockSwitch s;
            if (!expect(clock_switch_begin(down,(ClockFault)f,3U,&s) == CLOCK_OK, "begin")) {
                return 0;
            }
            for (uint32_t i = 0U; i < 64U && s.terminal == 0U; i++) {
                ClockStatus status = clock_switch_step(&s);
                if (!expect((status == CLOCK_OK || status == failures[f]) &&
                    s.hclk / s.apb1 <= 42000000U && s.hclk / s.apb2 <= 84000000U,
                    "step status and transient bus bounds")) {
                    return 0;
                }
            }
            if (!expect(s.terminal == 1U && s.steps < 50U && s.status == failures[f] &&
                s.hclk == (f != 0U ? 16000000U : down != 0U ? 84000000U : 168000000U), "terminal")) {
                return 0;
            }
            {
                uint32_t steps = s.steps;
                if (!expect(clock_switch_step(&s) == CLOCK_DONE && s.steps == steps, "bounded end")) {
                    return 0;
                }
            }
        }
    }
    return expect(clock_switch_step(NULL) == CLOCK_INVALID, "step NULL guard");
}

/** @brief Host validation, active with NDEBUG. @param[in] None. @return Nonzero on failure. */
int main(void)
{
    /** Never report buffered success before checking flush. **/
    if (!test_calculations()) {
        return 1;
    }
    if (!test_switch()) {
        return 1;
    }
    if (!test_domains()) {
        return 1;
    }
    if (!test_rejections()) {
        return 1;
    }
    if (puts("PASS unit09: rational clocks, tick boundaries, UART rounding, bounded up/down/fault switch") == EOF) {
        return 2;
    }
    if (fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
#endif

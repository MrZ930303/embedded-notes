/******************************************************************************
 * Copyright (C) 2024 EternalChip, Inc.(Gmbh) or its affiliates.
 *
 * All Rights Reserved.
 *
 * @file irq.c
 * @author OpenAI | R&D Dept. | EternalChip 立芯嵌入式
 * @brief Original deterministic host IRQ and RMW teaching models.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "irq.h"

/** @brief Map the complete external IRQ domain to slots.
 * @param[in] irq external number. @param[Out] None. @return 0..2 or3. */
static size_t irq_index(uint32_t irq)
{
    /**
    * IRQ0 is deliberately not a configurable line in this model.
    **/
    switch (irq) {
        case 6U: return 0U;
        case 29U: return 1U;
        case 38U: return 2U;
        default: return IRQ_LINE_COUNT;
    }
}

/** @brief Resolve a validated slot. @param[in] index0..2.
 * @param[Out] None. @return External IRQ number. */
static uint32_t irq_number(size_t index)
{
    /**
    * This array is immutable; callers validate index before lookup.
    **/
    static const uint32_t numbers[IRQ_LINE_COUNT] = {6U, 29U, 38U};
    return numbers[index];
}

/** @brief Check the intentionally restricted threshold model.
 * @param[in] group, primask, basepri wide values. @param[Out] None. @return Validity. */
static bool irq_masks_valid(uint32_t group, uint32_t primask, uint32_t basepri)
{
    /**
    * Only g3 gives the all-preemption-bit BASEPRI example taught here.
    **/
    return primask <= 1U && basepri <= 240U && (basepri % 16U) == 0U &&
        (basepri == 0U || group == 3U);
}

/** @brief Validate all three priority fields before mutation.
 * @param[in] group and live priorities. @param[Out] None. @return Validity. */
static bool irq_priorities_valid(uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT])
{
    IrqEncoding encoding;
    size_t index;
    /**
    * Each planner output is local; rejection cannot leak a partial config.
    **/
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        if (irq_encode(group, priorities[index].preempt, priorities[index].sub, &encoding) != IRQ_OK) {
            return false;
        }
    }
    return true;
}

/** @brief Check named initialized metadata, not arbitrary pointer validity.
 * @param[in] model initialized object. @param[Out] None. @return Validity. */
static bool irq_model_valid(const IrqModel *model)
{
    size_t index;
    IrqEncoding encoding;
    bool found[IRQ_LINE_COUNT] = {false, false, false};
    /**
    * The fixed stack must agree with active flags and strict nested groups.
    **/
    if (model->group > 7U || model->depth > IRQ_LINE_COUNT ||
        !irq_masks_valid(model->group, model->primask, model->basepri)) {
        return false;
    }
    for (index = 0U; index < model->depth; index++) {
        size_t slot = irq_index(model->stack[index]);
        if (slot == IRQ_LINE_COUNT || found[slot]) {
            return false;
        }
        if (index > 0U && model->lines[slot].priority.preempt >=
            model->lines[irq_index(model->stack[index - 1U])].priority.preempt) {
            return false;
        }
        found[slot] = true;
    }
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        if (model->lines[index].active != found[index] ||
            irq_encode(model->group, model->lines[index].priority.preempt,
                       model->lines[index].priority.sub, &encoding) != IRQ_OK ||
            (index >= model->depth && model->stack[index] != IRQ_NONE)) {
            return false;
        }
    }
    return true;
}

/** @brief Strict planner. @param[in] group, preempt, sub.
 * @param[Out] output on OK only. @return IrqStatus. */
IrqStatus irq_encode(uint32_t group, uint32_t preempt, uint32_t sub, IrqEncoding *output)
{
    /**
    * Validate in the wide input type before assigning any output field.
    **/
    IrqEncoding result;
    if (output == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (group > 7U) {
        return IRQ_INVALID_PRIORITY;
    }
    result.preemptBits = (group < 4U) ? 4U : 7U - group;
    result.subBits = 4U - result.preemptBits;
    if (preempt >= (UINT32_C(1) << result.preemptBits) || sub >= (UINT32_C(1) << result.subBits)) {
        return IRQ_INVALID_PRIORITY;
    }
    result.logical = (preempt << result.subBits) | sub;
    result.registerByte = result.logical << 4U;
    *output = result;
    return IRQ_OK;
}

/** @brief Fresh init without reading old storage. @param[in] group and priorities3.
 * @param[Out] model. @return IrqStatus. */
IrqStatus irq_init(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT])
{
    IrqModel fresh = {0};
    size_t index;
    /**
    * The fresh-storage premise is a caller lifetime obligation.
    **/
    if (model == NULL || priorities == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (!irq_priorities_valid(group, priorities)) {
        return IRQ_INVALID_PRIORITY;
    }
    fresh.group = group;
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        fresh.lines[index].enabled = true;
        fresh.lines[index].priority = priorities[index];
    }
    *model = fresh;
    return IRQ_OK;
}

/** @brief Checked idle reconfiguration. @param[in] group, priorities3.
 * @param[Out] model on OK. @return IrqStatus. */
IrqStatus irq_configure(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT])
{
    size_t index;
    /**
    * Existing pending state must never be reinterpreted under another split.
    **/
    if (model == NULL || priorities == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (!irq_model_valid(model)) {
        return IRQ_BAD_STATE;
    }
    if (!irq_priorities_valid(group, priorities) || !irq_masks_valid(group, model->primask, model->basepri)) {
        return IRQ_INVALID_PRIORITY;
    }
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        if (model->lines[index].pending || model->lines[index].active) {
            return IRQ_BUSY;
        }
    }
    model->group = group;
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        model->lines[index].priority = priorities[index];
    }
    return IRQ_OK;
}

/** @brief Saturating diagnostic operation. @param[in] Initialized objects.
 * @param[Out] value, saturated. @return IrqStatus. */
IrqStatus irq_diagnostic_increment(uint32_t *value, bool *saturated)
{
    /**
    * Exactly reaching MAX is still exact; only a further attempt is clipped.
    **/
    if (value == NULL || saturated == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (*value == UINT32_MAX) {
        *saturated = true;
    } else {
        (*value)++;
    }
    return IRQ_OK;
}

/** @brief Fresh history including unused slots. @param[in] None.
 * @param[Out] history. @return IrqStatus. */
IrqStatus irq_history_init(IrqHistory *history)
{
    size_t index;
    const IrqReport empty = {IRQ_CHANGED, IRQ_NONE, 0U, 0U, 0U, 0U, 0U};
    /**
    * Aggregate initialization initializes named members, not a padding promise.
    **/
    if (history == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    for (index = 0U; index < IRQ_HISTORY_CAPACITY; index++) {
        history->rows[index] = empty;
    }
    history->count = 0U;
    history->droppedRows = 0U;
    history->saturated = false;
    return IRQ_OK;
}

/** @brief Validate a complete one-operation command. @param[in] model, command.
 * @param[Out] None. @return Validity. */
static bool irq_command_valid(const IrqModel *model, const IrqCommand *command)
{
    /**
    * Unused fields are required zero so typos cannot silently change meaning.
    **/
    switch (command->operation) {
        case IRQ_ENABLE:
        case IRQ_LEVEL:
            return irq_index(command->irq) < IRQ_LINE_COUNT && command->value <= 1U && command->extra == 0U;
        case IRQ_PULSE:
        case IRQ_CLEAR_PENDING:
            return irq_index(command->irq) < IRQ_LINE_COUNT && command->value == 0U && command->extra == 0U;
        case IRQ_MASKS:
            return command->irq == IRQ_NONE && irq_masks_valid(model->group, command->value, command->extra);
        case IRQ_SELECT:
        case IRQ_RETURN:
            return command->irq == IRQ_NONE && command->value == 0U && command->extra == 0U;
        default:
            return false;
    }
}

/** @brief Choose at most one eligible nonactive identity. @param[in] model valid.
 * @param[Out] None. @return Slot0..2 or3 for none. */
static size_t irq_candidate(const IrqModel *model)
{
    size_t index;
    size_t best = IRQ_LINE_COUNT;
    uint32_t activeGroup = 16U;
    /**
    * Same-group subpriority cannot preempt an active handler.
    **/
    if (model->primask != 0U) {
        return best;
    }
    if (model->depth > 0U) {
        activeGroup = model->lines[irq_index(model->stack[model->depth - 1U])].priority.preempt;
    }
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        const IrqLine *line = &model->lines[index];
        if (!line->enabled || !line->pending || line->active || line->priority.preempt >= activeGroup ||
            (model->basepri != 0U && line->priority.preempt >= model->basepri / 16U)) {
            continue;
        }
        if (best == IRQ_LINE_COUNT || line->priority.preempt < model->lines[best].priority.preempt ||
            (line->priority.preempt == model->lines[best].priority.preempt &&
             line->priority.sub < model->lines[best].priority.sub)) {
            best = index;
        }
    }
    return best;
}

/** @brief Build copied current state flags. @param[in] model, event, irq.
 * @param[Out] None. @return Fully initialized report. */
static IrqReport irq_report(const IrqModel *model, IrqEvent event, uint32_t irq)
{
    IrqReport result = {IRQ_CHANGED, IRQ_NONE, 0U, 0U, 0U, 0U, 0U};
    size_t index;
    /**
    * Bit identities are fixed6/29/38, independent of current stack order.
    **/
    result.event = event;
    result.irq = irq;
    result.depth = model->depth;
    for (index = 0U; index < IRQ_LINE_COUNT; index++) {
        uint32_t bit = UINT32_C(1) << index;
        result.enabledBits |= model->lines[index].enabled ? bit : 0U;
        result.pendingBits |= model->lines[index].pending ? bit : 0U;
        result.activeBits |= model->lines[index].active ? bit : 0U;
        result.causeBits |= model->lines[index].cause ? bit : 0U;
    }
    return result;
}

/** @brief Perform one validated operation. @param[in] command, model initialized.
 * @param[Out] report fresh on OK, history optional. @return IrqStatus. */
IrqStatus irq_apply(IrqModel *model, const IrqCommand *command, IrqReport *report, IrqHistory *history)
{
    size_t index;
    IrqEvent event = IRQ_CHANGED;
    uint32_t identity = IRQ_NONE;
    /**
    * Complete preflight precedes every state, counter, output or history write.
    **/
    if (model == NULL || command == NULL || report == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (!irq_model_valid(model) || (history != NULL && history->count > IRQ_HISTORY_CAPACITY)) {
        return IRQ_BAD_STATE;
    }
    if (!irq_command_valid(model, command)) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (command->operation == IRQ_RETURN && model->depth == 0U) {
        return IRQ_BAD_STATE;
    }
    index = irq_index(command->irq);
    switch (command->operation) {
        case IRQ_ENABLE:
            model->lines[index].enabled = command->value != 0U;
            break;
        case IRQ_PULSE:
            model->lines[index].pending = true;
            if (irq_diagnostic_increment(&model->lines[index].pulses, &model->saturated) != IRQ_OK) {
                return IRQ_BAD_STATE;
            }
            break;
        case IRQ_LEVEL:
            model->lines[index].cause = command->value != 0U;
            if (command->value != 0U) {
                model->lines[index].pending = true;
            }
            break;
        case IRQ_CLEAR_PENDING:
            model->lines[index].pending = false;
            break;
        case IRQ_MASKS:
            model->primask = command->value;
            model->basepri = command->extra;
            break;
        case IRQ_SELECT:
            index = irq_candidate(model);
            event = IRQ_NO_ENTRY;
            if (index < IRQ_LINE_COUNT) {
                identity = irq_number(index);
                model->stack[model->depth++] = identity;
                model->lines[index].pending = false;
                model->lines[index].active = true;
                if (irq_diagnostic_increment(&model->lines[index].entries, &model->saturated) != IRQ_OK) {
                    return IRQ_BAD_STATE;
                }
                event = IRQ_ENTERED;
            }
            break;
        case IRQ_RETURN:
            identity = model->stack[--model->depth];
            model->stack[model->depth] = IRQ_NONE;
            index = irq_index(identity);
            model->lines[index].active = false;
            model->lines[index].pending = model->lines[index].pending || model->lines[index].cause;
            event = IRQ_RETURNED;
            break;
        default:
            break;
    }
    *report = irq_report(model, event, identity);
    if (history != NULL) {
        if (history->count < IRQ_HISTORY_CAPACITY) {
            history->rows[history->count++] = *report;
        } else if (irq_diagnostic_increment(&history->droppedRows, &history->saturated) != IRQ_OK) {
            return IRQ_BAD_STATE;
        }
    }
    return IRQ_OK;
}

/** @brief Fresh deterministic interpreter. @param[in] None.
 * @param[Out] model. @return IrqStatus. */
IrqStatus rmw_init(RmwModel *model)
{
    /**
    * No host volatile object or concurrent writer is involved.
    **/
    if (model == NULL) {
        return IRQ_INVALID_ARGUMENT;
    }
    *model = (RmwModel){0};
    return IRQ_OK;
}

/** @brief Execute a single legal actor stage. @param[in] actor, stage.
 * @param[Out] model and fresh report on OK. @return IrqStatus. */
IrqStatus rmw_step(RmwModel *model, uint32_t actor, RmwStage stage, RmwReport *report)
{
    /**
    * A six-step domain makes both interleavings defined and finite.
    **/
    if (model == NULL || report == NULL || actor > 1U || stage < RMW_READ || stage > RMW_WRITE) {
        return IRQ_INVALID_ARGUMENT;
    }
    if (model->value > 2U || model->steps > 6U || model->completed > 2U ||
        model->stage[0] < RMW_READ || model->stage[0] > RMW_DONE ||
        model->stage[1] < RMW_READ || model->stage[1] > RMW_DONE ||
        model->readValue[0] > 1U || model->readValue[1] > 1U ||
        model->computed[0] > 2U || model->computed[1] > 2U) {
        return IRQ_BAD_STATE;
    }
    if (model->steps == 6U) {
        return IRQ_TERMINAL;
    }
    if (model->stage[actor] != stage) {
        return IRQ_BAD_STATE;
    }
    switch (stage) {
        case RMW_READ:
            model->readValue[actor] = model->value;
            break;
        case RMW_COMPUTE:
            model->computed[actor] = model->readValue[actor] + 1U;
            break;
        case RMW_WRITE:
            model->value = model->computed[actor];
            model->completed++;
            break;
        default:
            break;
    }
    model->stage[actor] = (RmwStage)((uint32_t)stage + 1U);
    model->steps++;
    *report = (RmwReport){model->value, model->steps, model->completed,
        model->completed > model->value ? model->completed - model->value : 0U, model->steps == 6U};
    return IRQ_OK;
}

/** @brief Illustrate restoring caller mask. @param[in] saved0/1.
 * @param[Out] output on OK. @return IrqStatus. */
IrqStatus irq_mask_roundtrip(uint32_t saved, IrqMaskRoundtrip *output)
{
    /**
    * This is a pure contract example, never a host mask write.
    **/
    if (output == NULL || saved > 1U) {
        return IRQ_INVALID_ARGUMENT;
    }
    *output = (IrqMaskRoundtrip){saved, 1U, saved};
    return IRQ_OK;
}

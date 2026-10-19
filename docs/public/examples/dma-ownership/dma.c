/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file dma.c
 * @author embedded-notes contributors
 * @brief Bounded host fake events and generation-checked copied leases.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "dma.h"
#include <string.h>

/** @brief Saturating diagnostic increment, not identity allocation.
 * @param[in,out] value Counter.
 * @param[in,out] saturated Sticky shared truncation indication.
 * @return None. */
static void dma_increment(uint32_t *value, bool *saturated)
{
    /**
    * Reaching MAX is exact; only the subsequent attempted increment truncates.
    **/
    if (*value==UINT32_MAX) {
        *saturated=true;
    } else {
        *value+=1U;
    }
}

/** @brief Validate checkable named metadata in fixed two-block state.
 * @param[in] state Initialized object; not arbitrary/indeterminate storage.
 * @return True when the declared domain holds. */
static bool dma_valid(const DmaState *state)
{
    size_t index;
    size_t consumers=0U;
    /**
    * These checks do not validate C object lifetime, pointer provenance or aliases.
    **/
    if (state==NULL || state->phase<DMA_IDLE || state->phase>DMA_STOP_CONFIRMED ||
        state->cause<DMA_CAUSE_NONE || state->cause>DMA_CAUSE_TRANSFER ||
        state->run==0U || state->nextRun==0U || state->nextBlock==0U || state->current>=DMA_BLOCKS ||
        state->ndtr>DMA_ITEMS || state->stopValid>DMA_ITEMS || state->historyCount>DMA_HISTORY_ROWS) {
        return false;
    }
    for (index=0U;index<DMA_BLOCKS;index++) {
        const DmaDescriptor *descriptor=&state->blocks[index].descriptor;
        if (descriptor->owner<DMA_FREE || descriptor->owner>DMA_INVALID || descriptor->valid>DMA_ITEMS ||
            descriptor->token.slot!=index ||
            (descriptor->owner!=DMA_FREE && (descriptor->token.run!=state->run || descriptor->token.block==0U))) {
            return false;
        }
        if ((descriptor->owner==DMA_FREE && descriptor->valid!=0U) ||
            ((descriptor->owner==DMA_READY || descriptor->owner==DMA_CONSUMER) && descriptor->valid!=DMA_ITEMS)) {
            return false;
        }
        if (descriptor->owner==DMA_CONSUMER) {
            consumers+=1U;
        }
    }
    if (consumers!=(state->leasePresent ? 1U : 0U)) {
        return false;
    }
    if (state->leasePresent && (state->lease.slot>=DMA_BLOCKS ||
        state->blocks[state->lease.slot].descriptor.owner!=DMA_CONSUMER ||
        state->lease.run!=state->run || state->lease.block==0U ||
        state->lease.block!=state->blocks[state->lease.slot].descriptor.token.block)) {
        return false;
    }
    if (state->phase==DMA_RUNNING && (state->blocks[state->current].descriptor.owner!=DMA_WRITER ||
        state->ndtr!=DMA_ITEMS-state->blocks[state->current].descriptor.valid)) {
        return false;
    }
    return true;
}

/** @brief Copy all report fields and both descriptors, never array padding.
 * @param[in] state Valid state.
 * @param[out] report Disjoint fresh report.
 * @return None. */
static void dma_report(const DmaState *state, DmaReport *report)
{
    size_t index;
    /**
    * Reports carry metadata only; copied sample reads use dma_read.
    **/
    *report=(DmaReport){0};
    report->phase=state->phase;
    report->cause=state->cause;
    report->run=state->run;
    report->current=state->current;
    report->ndtr=state->ndtr;
    report->stopValid=state->stopValid;
    report->stopConfirmed=state->phase==DMA_STOP_CONFIRMED;
    report->ht=state->ht;
    report->tc=state->tc;
    report->leasePresent=state->leasePresent;
    report->lease=state->lease;
    report->diagnostics=state->diagnostics;
    for (index=0U;index<DMA_BLOCKS;index++) {
        report->descriptors[index]=state->blocks[index].descriptor;
    }
}

/** @brief Append at most one copied row, without controlling progress.
 * @param[in,out] state Valid state.
 * @param[in] status Observable successful transition result.
 * @return None. */
static void dma_history(DmaState *state, DmaStatus status)
{
    /**
    * Row33 is dropped; existing rows and execution progress remain independent.
    **/
    if (state->historyEnabled) {
        if (state->historyCount<DMA_HISTORY_ROWS) {
            DmaHistoryRow *row=&state->history[state->historyCount];
            *row=(DmaHistoryRow){status,state->phase,state->run,state->current,
                state->blocks[state->current].descriptor.valid};
            state->historyCount+=1U;
        } else {
            dma_increment(&state->diagnostics.historyDropped,&state->diagnostics.saturated);
        }
    }
}

/** @brief Allocate one positive identity without wrap or reuse.
 * @param[in,out] next Last available ID remains stored at MAX.
 * @param[in,out] exhausted True after MAX was allocated.
 * @return Allocated positive ID; caller prechecks exhaustion. */
static uint32_t dma_allocate(uint32_t *next, bool *exhausted)
{
    uint32_t identity=*next;
    /**
    * Identity exhaustion is separate from saturating diagnostics.
    **/
    if (*next==UINT32_MAX) {
        *exhausted=true;
    } else {
        *next+=1U;
    }
    return identity;
}

/** @brief Prepare a known FREE current slot after exhaustion was checked.
 * @param[in,out] state Valid idle/boundary state.
 * @return None. */
static void dma_begin(DmaState *state)
{
    DmaBlock *block=&state->blocks[state->current];
    size_t index;
    /**
    * Clearing old payload is bounded; a new identity never extends old leases.
    **/
    block->descriptor.owner=DMA_WRITER;
    block->descriptor.valid=0U;
    block->descriptor.token=(DmaToken){state->run,
        dma_allocate(&state->nextBlock,&state->blockExhausted),state->current};
    for (index=0U;index<DMA_ITEMS;index++) {
        block->items[index]=0U;
    }
    state->ndtr=DMA_ITEMS;
    state->phase=DMA_RUNNING;
}

/** @brief Classify token syntax and instance identity.
 * @param[in] state Valid initialized state.
 * @param[in] token Real disjoint token.
 * @return DMA_OK or preserving token/argument error. */
static DmaStatus dma_token(const DmaState *state, const DmaToken *token)
{
    const DmaDescriptor *descriptor;
    /**
    * Zero is never an old positive identity and is classified separately.
    **/
    if (token==NULL || token->slot>=DMA_BLOCKS) {
        return DMA_INVALID_ARGUMENT;
    }
    if (token->run==0U || token->block==0U) {
        return DMA_INVALID_TOKEN;
    }
    descriptor=&state->blocks[token->slot].descriptor;
    if (token->run!=state->run || token->run!=descriptor->token.run ||
        token->block!=descriptor->token.block || descriptor->owner==DMA_FREE) {
        return DMA_STALE_TOKEN;
    }
    return DMA_OK;
}

/** @brief Check exactly the currently outstanding consumer lease.
 * @param[in] state Valid initialized state.
 * @param[in] lease Real token.
 * @return DMA_OK or preserving token rejection. */
static DmaStatus dma_lease(const DmaState *state, const DmaToken *lease)
{
    DmaStatus status=dma_token(state,lease);
    /**
    * Matching storage identity without CONSUMER ownership does not authorize access.
    **/
    if (status!=DMA_OK) {
        return status;
    }
    if (!state->leasePresent || state->blocks[lease->slot].descriptor.owner!=DMA_CONSUMER ||
        lease->run!=state->lease.run || lease->block!=state->lease.block || lease->slot!=state->lease.slot) {
        return DMA_STALE_TOKEN;
    }
    return DMA_OK;
}

/** @brief Validate numeric placement before multiplication/narrowing.
 * @param[in] request Declared numeric region/extent/count/width.
 * @param[out] bytes Fresh checked byte count on success only.
 * @return Explicit placement status. */
DmaStatus dma_check_placement(const DmaPlacement *request, uint32_t *bytes)
{
    uint64_t end;
    uint64_t limit;
    uint32_t countBytes;
    /**
    * SRAM1 and SRAM2 are distinct domains; adjacent memory is not an allocation.
    **/
    if (request==NULL || bytes==NULL || request->count==0U || request->count>65535U ||
        (request->widthBytes!=1U && request->widthBytes!=2U && request->widthBytes!=4U) ||
        request->address>UINT32_MAX || request->allocatedBytes>UINT32_MAX) {
        return DMA_INVALID_ARGUMENT;
    }
    if (request->address>=UINT64_C(0x20000000) && request->address<UINT64_C(0x2001c000)) {
        limit=UINT64_C(0x2001c000);
    } else if (request->address>=UINT64_C(0x2001c000) && request->address<UINT64_C(0x20020000)) {
        limit=UINT64_C(0x20020000);
    } else {
        return DMA_BAD_REGION;
    }
    if (request->address%request->widthBytes!=0U) {
        return DMA_BAD_ALIGNMENT;
    }
    countBytes=request->count*request->widthBytes;
    end=request->address+countBytes;
    if (request->allocatedBytes<countBytes || end>limit) {
        return DMA_BAD_EXTENT;
    }
    *bytes=countBytes;
    return DMA_OK;
}

/** @brief Initialize every named field without reading prior storage.
 * @param[out] state Genuinely fresh object.
 * @param[in] fixture Public finite edge fixture.
 * @param[in] historyEnabled Enable diagnostic rows.
 * @return DMA_OK or preserving DMA_INVALID_ARGUMENT. */
DmaStatus dma_init(DmaState *state, DmaFixture fixture, bool historyEnabled)
{
    size_t index;
    /**
    * Validation precedes the first write; reinitializing live ownership is forbidden.
    **/
    if (state==NULL || fixture<DMA_FIXTURE_NORMAL || fixture>DMA_FIXTURE_COUNTER_EDGE) {
        return DMA_INVALID_ARGUMENT;
    }
    /**
    * Every field is an integer/enum/bool or an array thereof, with valid zero bits.
    * Fixed-size clearing avoids a whole-state automatic compound-literal temporary.
    **/
    memset(state,0,sizeof(*state));
    state->run=fixture==DMA_FIXTURE_LAST_RUN ? UINT32_MAX-1U : 1U;
    state->nextRun=fixture==DMA_FIXTURE_LAST_RUN ? UINT32_MAX : 2U;
    state->nextBlock=fixture==DMA_FIXTURE_LAST_BLOCK ? UINT32_MAX : 1U;
    state->historyEnabled=historyEnabled;
    state->ndtr=DMA_ITEMS;
    for (index=0U;index<DMA_BLOCKS;index++) {
        state->blocks[index].descriptor.token.slot=(uint32_t)index;
    }
    if (fixture==DMA_FIXTURE_COUNTER_EDGE) {
        state->diagnostics=(DmaDiagnostics){UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,
            UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,UINT32_MAX-1U,false};
    }
    return DMA_OK;
}

/** @brief Start first transfer of an idle run.
 * @param[in,out] state Initialized idle object.
 * @param[out] report Disjoint output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_start(DmaState *state, DmaReport *report)
{
    /**
    * The allocator precheck occurs before ownership or payload mutation.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_IDLE || state->leasePresent) {
        return DMA_BUSY;
    }
    if (state->blockExhausted) {
        return DMA_EXHAUSTED;
    }
    state->current=0U;
    dma_begin(state);
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Write at most one supplied item; completion is a separate phase.
 * @param[in,out] state Initialized running object.
 * @param[in] sample Checked before narrowing.
 * @param[out] report Disjoint output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_push(DmaState *state, uint32_t sample, DmaReport *report)
{
    DmaBlock *block;
    /**
    * No arrival after a stop request writes any block, even if a lease is retained.
    **/
    if (state==NULL || report==NULL || sample>UINT16_MAX) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_RUNNING) {
        return DMA_NOT_RUNNING;
    }
    block=&state->blocks[state->current];
    if (block->descriptor.owner!=DMA_WRITER || state->ndtr==0U) {
        return DMA_BAD_STATE;
    }
    block->items[block->descriptor.valid]=(uint16_t)sample;
    block->descriptor.valid+=1U;
    state->ndtr-=1U;
    if (state->ndtr==2U) {
        state->ht=true;
    }
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Supply the separate full-block completion fact.
 * @param[in,out] state Full matching WRITER.
 * @param[in] token Exact current transfer token.
 * @param[out] report Disjoint output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_complete(DmaState *state, const DmaToken *token, DmaReport *report)
{
    DmaStatus status;
    DmaBlock *block;
    /**
    * Check identity before phase so delayed old completions remain explicitly stale.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    status=dma_token(state,token);
    if (status!=DMA_OK) {
        return status;
    }
    if (state->phase!=DMA_RUNNING || token->slot!=state->current || state->ndtr!=0U) {
        return DMA_BAD_STATE;
    }
    block=&state->blocks[state->current];
    if (block->descriptor.owner!=DMA_WRITER || block->descriptor.valid!=DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    block->descriptor.owner=DMA_READY;
    state->tc=true;
    dma_increment(&state->diagnostics.completed,&state->diagnostics.saturated);
    state->current=1U-state->current;
    state->ndtr=DMA_ITEMS;
    state->phase=DMA_BOUNDARY;
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Check reuse at an explicit fake boundary; do not write data.
 * @param[in,out] state Boundary object.
 * @param[out] report Fresh OK/late metadata.
 * @return DMA_OK/DMA_LATE_REUSE or preserving rejection. */
DmaStatus dma_begin_next(DmaState *state, DmaReport *report)
{
    /**
    * Lateness protects the next fake write, not a physical running stream.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_BOUNDARY) {
        return DMA_BAD_STATE;
    }
    if (state->blocks[state->current].descriptor.owner!=DMA_FREE) {
        state->phase=DMA_STOP_REQUESTED;
        state->cause=DMA_CAUSE_LATE;
        state->stopValid=0U;
        dma_increment(&state->diagnostics.lateReuse,&state->diagnostics.saturated);
        dma_history(state,DMA_LATE_REUSE);
        dma_report(state,report);
        return DMA_LATE_REUSE;
    }
    if (state->blockExhausted) {
        return DMA_EXHAUSTED;
    }
    dma_begin(state);
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Claim the oldest of at most two READY instances.
 * @param[in,out] state Initialized object.
 * @param[out] lease Refreshed only on success.
 * @return DMA_OK/EMPTY/BUSY or preserving rejection. */
DmaStatus dma_claim(DmaState *state, DmaToken *lease)
{
    size_t index;
    size_t selected=DMA_BLOCKS;
    /**
    * One consumer is an explicit policy, independent of descriptor capacity.
    **/
    if (state==NULL || lease==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->leasePresent) {
        return DMA_BUSY;
    }
    for (index=0U;index<DMA_BLOCKS;index++) {
        if (state->blocks[index].descriptor.owner==DMA_READY &&
            (selected==DMA_BLOCKS || state->blocks[index].descriptor.token.block<
                state->blocks[selected].descriptor.token.block)) {
            selected=index;
        }
    }
    if (selected==DMA_BLOCKS) {
        return DMA_EMPTY;
    }
    state->blocks[selected].descriptor.owner=DMA_CONSUMER;
    state->lease=state->blocks[selected].descriptor.token;
    state->leasePresent=true;
    *lease=state->lease;
    dma_history(state,DMA_OK);
    return DMA_OK;
}

/** @brief Copy one authorized sample while preserving on invalid index/token.
 * @param[in,out] state Initialized object.
 * @param[in] lease Matching lease.
 * @param[in] index Wide item index.
 * @param[out] sample Copied16-bit result.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_read(DmaState *state, const DmaToken *lease, uint32_t index, uint16_t *sample)
{
    DmaStatus status;
    /**
    * No caller receives a pointer into reusable producer storage.
    **/
    if (state==NULL || sample==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    status=dma_lease(state,lease);
    if (status!=DMA_OK) {
        return status;
    }
    if (index>=state->blocks[lease->slot].descriptor.valid) {
        return DMA_INVALID_ARGUMENT;
    }
    *sample=state->blocks[lease->slot].items[index];
    dma_increment(&state->diagnostics.copiedItems,&state->diagnostics.saturated);
    return DMA_OK;
}

/** @brief Release only the matching consumer instance, including during stop.
 * @param[in,out] state Initialized object.
 * @param[in] lease Exact outstanding token.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_release(DmaState *state, const DmaToken *lease)
{
    DmaStatus status;
    /**
    * Releasing ownership does not confirm that the backend stopped.
    **/
    if (state==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    status=dma_lease(state,lease);
    if (status!=DMA_OK) {
        return status;
    }
    state->blocks[lease->slot].descriptor.owner=DMA_FREE;
    state->blocks[lease->slot].descriptor.valid=0U;
    state->leasePresent=false;
    state->lease=(DmaToken){0};
    dma_increment(&state->diagnostics.released,&state->diagnostics.saturated);
    dma_history(state,DMA_OK);
    return DMA_OK;
}

/** @brief Request user-stop or transfer-error with initiating partial length.
 * @param[in,out] state Running/boundary state.
 * @param[in] cause USER/TRANSFER only.
 * @param[out] report Fresh result on accepted request.
 * @return DMA_OK/DMA_TRANSFER_ERROR or preserving rejection. */
DmaStatus dma_request_stop(DmaState *state, DmaCause cause, DmaReport *report)
{
    DmaStatus status=cause==DMA_CAUSE_TRANSFER ? DMA_TRANSFER_ERROR : DMA_OK;
    /**
    * Valid complete READY blocks and an outstanding consumer remain accurately owned.
    **/
    if (state==NULL || report==NULL || (cause!=DMA_CAUSE_USER && cause!=DMA_CAUSE_TRANSFER)) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_RUNNING && state->phase!=DMA_BOUNDARY) {
        return DMA_BAD_STATE;
    }
    state->stopValid=0U;
    if (state->phase==DMA_RUNNING) {
        state->stopValid=state->blocks[state->current].descriptor.valid;
        state->blocks[state->current].descriptor.owner=DMA_INVALID;
    }
    state->phase=DMA_STOP_REQUESTED;
    state->cause=cause;
    if (cause==DMA_CAUSE_TRANSFER) {
        dma_increment(&state->diagnostics.transferErrors,&state->diagnostics.saturated);
    }
    dma_history(state,status);
    dma_report(state,report);
    return status;
}

/** @brief Supply independent confirmation; never infer it from stop intent.
 * @param[in,out] state Stop-requested state.
 * @param[out] report Fresh metadata.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_confirm_stop(DmaState *state, DmaReport *report)
{
    /**
    * A consumer lease survives backend confirmation until matching release.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_STOP_REQUESTED) {
        return DMA_BAD_STATE;
    }
    state->phase=DMA_STOP_CONFIRMED;
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Recover only after both independent release conditions hold.
 * @param[in,out] state Confirmed stopped state without lease.
 * @param[out] report Fresh idle/new-run snapshot.
 * @return DMA_OK/BUSY/EXHAUSTED or preserving rejection. */
DmaStatus dma_recover(DmaState *state, DmaReport *report)
{
    size_t index;
    /**
    * Run allocation is checked before discarding any prior data or observations.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->phase!=DMA_STOP_CONFIRMED || state->leasePresent) {
        return DMA_BUSY;
    }
    if (state->runExhausted) {
        return DMA_EXHAUSTED;
    }
    state->run=dma_allocate(&state->nextRun,&state->runExhausted);
    for (index=0U;index<DMA_BLOCKS;index++) {
        if (state->blocks[index].descriptor.owner==DMA_READY) {
            dma_increment(&state->diagnostics.discardedReady,&state->diagnostics.saturated);
        }
        state->blocks[index]=(DmaBlock){0};
        state->blocks[index].descriptor.token.slot=(uint32_t)index;
    }
    state->phase=DMA_IDLE;
    state->cause=DMA_CAUSE_NONE;
    state->current=0U;
    state->ndtr=DMA_ITEMS;
    state->stopValid=0U;
    state->ht=false;
    state->tc=false;
    dma_history(state,DMA_OK);
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Observe latches rather than reconstruct arbitrary missed history.
 * @param[in,out] state Initialized state.
 * @param[in] clear Clear both latches after copying.
 * @param[out] report Fresh pre-clear flags.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_observe(DmaState *state, bool clear, DmaReport *report)
{
    /**
    * Reobserving an uncleared TC is another observation, not another completion.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    if (state->tc) {
        dma_increment(&state->diagnostics.observedTc,&state->diagnostics.saturated);
    }
    dma_history(state,DMA_OK);
    dma_report(state,report);
    if (clear) {
        state->ht=false;
        state->tc=false;
    }
    return DMA_OK;
}

/** @brief Copy bounded metadata in every accepted lifecycle phase.
 * @param[in] state Initialized object.
 * @param[out] report Fresh output.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_status(const DmaState *state, DmaReport *report)
{
    /**
    * Status remains available while waiting for independent stop/release facts.
    **/
    if (state==NULL || report==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (!dma_valid(state)) {
        return DMA_BAD_STATE;
    }
    dma_report(state,report);
    return DMA_OK;
}

/** @brief Initialize independent raw-counterexample storage.
 * @param[out] state Fresh raw object.
 * @return DMA_OK or preserving DMA_INVALID_ARGUMENT. */
DmaStatus dma_raw_init(DmaRawState *state)
{
    /**
    * The raw model never grants a safe consumer lease.
    **/
    if (state==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    *state=(DmaRawState){0};
    state->ndtr=DMA_ITEMS;
    return DMA_OK;
}

/** @brief Inject one raw transfer; fourth item auto-switches CT.
 * @param[in,out] state Initialized raw object.
 * @param[in] sample Wide checked16-bit input.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_push(DmaRawState *state, uint32_t sample)
{
    uint32_t index;
    /**
    * This sequential fake explicitly demonstrates logical overwrite without a C race.
    **/
    if (state==NULL || sample>UINT16_MAX) {
        return DMA_INVALID_ARGUMENT;
    }
    if (state->current>=DMA_BLOCKS || state->ndtr==0U || state->ndtr>DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    index=DMA_ITEMS-state->ndtr;
    if (state->held[state->current]) {
        state->ownershipViolation=true;
    }
    state->items[state->current][index]=(uint16_t)sample;
    state->ndtr-=1U;
    if (state->ndtr==2U) {
        state->ht=true;
    }
    if (state->ndtr==0U) {
        state->tc=true;
        dma_increment(&state->completed,&state->saturated);
        state->current=1U-state->current;
        state->ndtr=DMA_ITEMS;
    }
    return DMA_OK;
}

/** @brief Retain an illustrative completed raw block; no writer enforcement.
 * @param[in,out] state Initialized raw object.
 * @param[in] slot Non-current completed slot.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_hold(DmaRawState *state, uint32_t slot)
{
    /**
    * Raw DBM does not wait for this software-held marker.
    **/
    if (state==NULL || slot>=DMA_BLOCKS) {
        return DMA_INVALID_ARGUMENT;
    }
    if (state->current>=DMA_BLOCKS || state->ndtr==0U || state->ndtr>DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    if (slot==state->current || state->completed==0U) {
        return DMA_BAD_STATE;
    }
    state->held[slot]=true;
    return DMA_OK;
}

/** @brief Observe one raw latch, optionally clearing both flags.
 * @param[in,out] state Initialized raw object.
 * @param[in] clear Clear after observation.
 * @return DMA_OK or preserving rejection. */
DmaStatus dma_raw_observe(DmaRawState *state, bool clear)
{
    /**
    * An observed latch count is not the fake generator's injected completion count.
    **/
    if (state==NULL) {
        return DMA_INVALID_ARGUMENT;
    }
    if (state->current>=DMA_BLOCKS || state->ndtr==0U || state->ndtr>DMA_ITEMS) {
        return DMA_BAD_STATE;
    }
    if (state->tc) {
        dma_increment(&state->observedTc,&state->saturated);
    }
    if (clear) {
        state->ht=false;
        state->tc=false;
    }
    return DMA_OK;
}

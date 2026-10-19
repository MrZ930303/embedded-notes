/******************************************************************************
 * Copyright (C) 2024 EternalChip, Inc.(Gmbh) or its affiliates.
 *
 * All Rights Reserved.
 *
 * @file irq.h
 * @author OpenAI | R&D Dept. | EternalChip 立芯嵌入式
 * @brief Original, single-context host teaching models; no target instructions.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#ifndef INTERRUPT_SHARED_DATA_IRQ_H
#define INTERRUPT_SHARED_DATA_IRQ_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define IRQ_LINE_COUNT 3U
#define IRQ_HISTORY_CAPACITY 32U
#define IRQ_NONE 0U

/* All objects are exclusively owned, non-reentrant, live, typed and initialized.
 * Caller may inspect named fields but must not edit them. Fresh init requires
 * fresh storage with no live operation/old event. It does not read old bytes.
 * Every pointer names sufficient actual storage, alive through the call.
 * Inputs, state, optional history and writable outputs must be pairwise disjoint.
 * Null/domain/checkable metadata reject; dangling/forged pointers, caller aliasing
 * and arbitrary corruption cannot be detected. No heap, MMIO, threads or ISR.
 * Non-OK returns preserve all named fields, history and outputs. A report is fresh
 * ONLY on IRQ_OK; a retained report after rejection is historical, even if its
 * event says ENTERED. OK NO_ENTRY is fresh evidence of zero entry this call.
 */
typedef enum { IRQ_OK, IRQ_INVALID_ARGUMENT, IRQ_INVALID_PRIORITY, IRQ_BAD_STATE,
               IRQ_BUSY, IRQ_TERMINAL } IrqStatus;
typedef struct { uint32_t preempt; uint32_t sub; } IrqPriority;
typedef struct { uint32_t preemptBits; uint32_t subBits; uint32_t logical;
                 uint32_t registerByte; } IrqEncoding;
typedef struct { bool enabled; bool pending; bool active; bool cause;
                 IrqPriority priority; uint32_t pulses; uint32_t entries; } IrqLine;
typedef struct { uint32_t group; IrqLine lines[IRQ_LINE_COUNT];
                 uint32_t stack[IRQ_LINE_COUNT]; size_t depth;
                 uint32_t primask; uint32_t basepri; bool saturated; } IrqModel;
typedef enum { IRQ_ENABLE, IRQ_PULSE, IRQ_LEVEL, IRQ_CLEAR_PENDING,
               IRQ_SELECT, IRQ_RETURN, IRQ_MASKS } IrqOperation;
/* ENABLE/LEVEL: irq=6/29/38,value=0/1,extra=0. PULSE/CLEAR: value=extra=0.
 * MASKS: irq=0,value=PRIMASK0/1,extra=raw BASEPRI. SELECT/RETURN: all three0.
 * LEVEL supplies a cause fact, not an MMIO acknowledgement. False cause leaves
 * the pending latch unchanged. Return with cause true explicitly re-pends.
 */
typedef struct { IrqOperation operation; uint32_t irq; uint32_t value; uint32_t extra; } IrqCommand;
typedef enum { IRQ_CHANGED, IRQ_NO_ENTRY, IRQ_ENTERED, IRQ_RETURNED } IrqEvent;
typedef struct { IrqEvent event; uint32_t irq; size_t depth;
                 uint32_t enabledBits; uint32_t pendingBits;
                 uint32_t activeBits; uint32_t causeBits; } IrqReport;
/* Bits0/1/2 consistently identify IRQ6/29/38; unused stack/report slots are0.
 * History is optional caller-owned copied diagnostics, never execution storage.
 * First32 accepted apply calls append one row each. Row33+ drops only that row,
 * increments droppedRows saturating, and execution still advances. */
typedef struct { IrqReport rows[IRQ_HISTORY_CAPACITY]; size_t count;
                 uint32_t droppedRows; bool saturated; } IrqHistory;
typedef enum { RMW_READ, RMW_COMPUTE, RMW_WRITE, RMW_DONE } RmwStage;
typedef struct { uint32_t value; uint32_t readValue[2]; uint32_t computed[2];
                 RmwStage stage[2]; uint32_t steps; uint32_t completed; } RmwModel;
typedef struct { uint32_t value; uint32_t steps; uint32_t completed;
                 uint32_t lost; bool terminal; } RmwReport;
typedef struct { uint32_t saved; uint32_t inside; uint32_t restored; } IrqMaskRoundtrip;

/** @brief Strict four-bit planner; unlike CMSIS it rejects rather than masks.
 * @param[in] group0..7, preempt/sub allocated-width values.
 * @param[Out] output fresh only on IRQ_OK. @return IrqStatus. */
IrqStatus irq_encode(uint32_t group, uint32_t preempt, uint32_t sub, IrqEncoding *output);
/** @brief Fresh model init; lines enabled, no pending/active/cause/counters.
 * @param[in] priorities exactly3 valid values, copied; group0..7.
 * @param[Out] model fresh initialized storage. @return IrqStatus. */
IrqStatus irq_init(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT]);
/** @brief Replace group/priorities only when all lines inactive and not pending.
 * @param[in] priorities3, group compatible with current mask.
 * @param[Out] model accepted state on OK. @return IrqStatus. */
IrqStatus irq_configure(IrqModel *model, uint32_t group, const IrqPriority priorities[IRQ_LINE_COUNT]);
/** @brief Apply one event, at most one entry OR one return; no handler execution.
 * @param[in] command complete and validated; model initialized.
 * @param[Out] report fresh on OK; optional history initialized, otherwise NULL.
 * @return IrqStatus. Rejection preserves every named object. */
IrqStatus irq_apply(IrqModel *model, const IrqCommand *command, IrqReport *report, IrqHistory *history);
/** @brief Fresh empty optional history, including every unused row.
 * @param[in] None. @param[Out] history fresh storage. @return IrqStatus. */
IrqStatus irq_history_init(IrqHistory *history);
/** @brief Saturate a diagnostic; sticky only after attempted increment at MAX.
 * @param[in] initialized disjoint objects. @param[Out] value and sticky flag.
 * @return IrqStatus. This standalone seam permits a finite near-MAX fixture. */
IrqStatus irq_diagnostic_increment(uint32_t *value, bool *saturated);
/** @brief Fresh two-actor RMW interpreter, x0, both actors at READ.
 * @param[in] None. @param[Out] model fresh storage. @return IrqStatus. */
IrqStatus rmw_init(RmwModel *model);
/** @brief Execute exactly the selected actor's next legal stage.
 * @param[in] actor0 foreground/1 IRQ, stage READ/COMPUTE/WRITE.
 * @param[Out] report fresh only on OK. @return IrqStatus. Six accepted steps max. */
IrqStatus rmw_step(RmwModel *model, uint32_t actor, RmwStage stage, RmwReport *report);
/** @brief Pure saved-mask illustration, never changes host interrupt state.
 * @param[in] saved0/1. @param[Out] output fresh on OK. @return IrqStatus. */
IrqStatus irq_mask_roundtrip(uint32_t saved, IrqMaskRoundtrip *output);

#endif

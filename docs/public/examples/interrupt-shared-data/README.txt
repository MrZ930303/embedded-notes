Interrupt/shared-data host models, v1
===================================
Original single-context, non-reentrant host C11. No target NVIC/CMSIS/MMIO,
threads, actual ISR, DMA, heap, callbacks, waits or hardware timing claims.
Keep irq.h, irq.c and this README.txt in one directory. Save exactly the text
between BEGIN CONSUMER.C and END CONSUMER.C below as consumer.c (markers excluded).
The module has no main. The independent consumer includes the public header twice.

With an existing C11 compiler, from that directory:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -fstack-usage -c irq.c -o irq.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -fstack-usage -c consumer.c -o consumer.o
  cc irq.o consumer.o -o consumer
  ./consumer
On Windows, name the linked output consumer.exe and run .\consumer.exe.
Repeat with -DNDEBUG in BOTH compile commands, distinct output names and linkage.
Do not run a previous executable if any compile/link failed. CHECK remains live
with NDEBUG. No target toolchain/atomic library/ISR guarantee follows from this.

The course's actual author/CI C experiments use existing mcu-build routing:
  node scripts/test-interrupt-shared-data.mjs --native --compiler <existing-cc> --python <existing-python> --router <existing-build_router.py> --output .scratch/interrupt-dma-throughput/native
Run that command from the repository root. Each production module, independent
caller and link goes through validate -> dry-run -> build profiles. Tool identities,
raw exit, diagnostics, fresh artifacts and input SHA-256 are recorded. Nothing is
installed. The same runner extracts THIS minimal consumer text and builds/runs it
as an additional separate normal/NDEBUG caller, rather than trusting a transcript.

Success output (exactly one line):
PASS minimal IRQ: logical9/raw0x90 lost1/serialized2 saved1/restored1

BEGIN CONSUMER.C
#include "irq.h"
#include "irq.h"
#include <stdio.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL %d: %s\n", __LINE__, #x); return 1; } } while (0)
int main(void)
{
    IrqEncoding encoding = {0U, 0U, 0U, 0U};
    IrqMaskRoundtrip mask = {0U, 0U, 0U};
    RmwModel lost;
    RmwModel serial;
    RmwReport report = {0U, 0U, 0U, 0U, false};
    const uint32_t actors[6] = {0U, 1U, 1U, 1U, 0U, 0U};
    const RmwStage stages[6] = {RMW_READ, RMW_READ, RMW_COMPUTE, RMW_WRITE, RMW_COMPUTE, RMW_WRITE};
    size_t index;
    CHECK(irq_encode(5U, 2U, 1U, &encoding) == IRQ_OK);
    CHECK(encoding.logical == 9U && encoding.registerByte == 144U);
    CHECK(rmw_init(&lost) == IRQ_OK && rmw_init(&serial) == IRQ_OK);
    for (index = 0U; index < 6U; index++) {
        CHECK(rmw_step(&lost, actors[index], stages[index], &report) == IRQ_OK);
    }
    CHECK(report.terminal && report.value == 1U && report.lost == 1U);
    for (index = 0U; index < 2U; index++) {
        CHECK(rmw_step(&serial, (uint32_t)index, RMW_READ, &report) == IRQ_OK);
        CHECK(rmw_step(&serial, (uint32_t)index, RMW_COMPUTE, &report) == IRQ_OK);
        CHECK(rmw_step(&serial, (uint32_t)index, RMW_WRITE, &report) == IRQ_OK);
    }
    CHECK(report.terminal && report.value == 2U && report.lost == 0U);
    CHECK(irq_mask_roundtrip(1U, &mask) == IRQ_OK && mask.inside == 1U && mask.restored == 1U);
    if (puts("PASS minimal IRQ: logical9/raw0x90 lost1/serialized2 saved1/restored1") < 0 || fflush(stdout) != 0) {
        return 2;
    }
    return 0;
}
END CONSUMER.C

Ownership and freshness
-----------------------
All state, input arrays/commands, optional history and output objects must be real,
live, sufficiently sized typed objects, pairwise disjoint and exclusively owned.
Fresh irq_init/rmw_init/history_init validate then write every named field without
reading indeterminate storage. Fresh storage has no live operation/owner/old event;
initialization is not a runtime test or erase permission for a violated lifetime.
Later operations require initialized objects. Callers inspect but do not edit named
model members. No claim of detecting forged/dangling pointers, false extents,
arbitrary corruption or aliasing. NULL/enum/domain/checkable metadata reject.
Only IRQ_OK gives a fresh output. All non-OK results, including IRQ_TERMINAL,
preserve every named state/diagnostic/history/output field. Retained reports are
historical. IRQ_OK + IRQ_NO_ENTRY freshly reports zero entries. No assert-dependent
validation; compare named members, not padding. Bool and uint32/size_t availability
follow C11 implementation support; no ABI-fixed sizeof promise.

Priority and external IRQ model
-------------------------------
Selected F407 has four priority bits. Raw g0/1/2/3 -> pre4/sub0; g4 -> 3/1;
g5 -> 2/2; g6 -> 1/3; g7 -> 0/4. Strict inputs reject before assignment;
CMSIS5.9.0 masks fields instead (g5/pre4/sub0 would mask to0).
Only EXTI0_IRQn6 / TIM3_IRQn29 / USART2_IRQn38 exist; fixed slot bits0/1/2.
Initial lines enabled; pending/active/cause false, counters/masks/depth/stack0.
irq_configure changes all three priorities/group only when none pending/active;
existing nonzero BASEPRI also requires g3. Counters/cause/enables remain unchanged.
irq_apply accepts exactly one complete command. SELECT enters at most one enabled,
pending, nonactive identity whose group is strictly more urgent than current.
Smallest group, then sub, then IRQ number wins. Same-group sub does not preempt.
Enter clears its pending latch. RETURN pops only the current top and never selects.
Persistent LEVEL cause relatches pending only at the explicit RETURN transition;
LEVEL false does not clear pending. PULSE is a request fact, coalesces pending and
increments injected-pulse diagnostics. CLEAR_PENDING does not clear cause/active.
ENABLE changes only enable. This fake does not acknowledge any physical peripheral.
MASKS requires irq0,value PRIMASK0/1,extra BASEPRI raw0 or upper-nibble0x10..0xF0.
Nonzero BASEPRI is supported only in g3; all other groups require0. PRIMASK blocks
these configurable entries; it does not cancel active work or stop DMA/NMI/HardFault.
Fault architecture and privileged target mask operations are not executed.

Fixed resource/work limits
--------------------------
IrqModel: 3 line records, 3 active identity slots, 6 pulse/entry uint32 diagnostics.
Planner/roundtrip: constant arithmetic. Init/configure validate exactly3 priorities.
Apply: check at most3 stack identities +3 line records; SELECT scans3 candidates;
report scans3 lines; at most1 entry OR1 return, no callback or automatic pending drain.
Optional IrqHistory: exactly32 copied IrqReport rows, count0..32, no execution owner.
One accepted apply appends at most1 row; row33+ is dropped, droppedRows increments
saturating, existing rows stay intact, execution continues. NULL disables history.
Init clears every unused named row/stack field. Config/encode/RMW do not append it.
Counters saturate: MAX-1 -> MAX with flag unchangedfalse; attempted next increment
staysMAX and sets stickytrue. Further increments remainMAX/true. Diagnostics no
longer yield exact totals/rates after saturation. irq_diagnostic_increment provides
a finite initialized near-MAX public test seam, not permission to edit live state.
RMW: 2 actors (0 foreground,1 IRQ), READ/COMPUTE/WRITE/DONE, exactly6 accepted
steps total, one step/call and no internal loop. Illegal/out-of-order/repeated stage
rejects preserving state/report. Completed6 -> IRQ_TERMINAL on any later legal call.
The two schedules above are explicit single-context interpretation, no real C race.
Saved-mask output is pure data:0->1->0 and1->1->1, no actual host mask operation.

Limits and primary evidence
----------------------------
volatile does not supply mutual exclusion or atomic RMW. Atomic fetch-add/relaxed,
compiler barriers, DMB/DSB/ISB, DMA ownership/cache visibility and capacity differ.
A bounded critical section covers only conflicting CPU contexts actually masked,
with saved-mask restoration; DMA/NMI/HardFault remain excluded writers.
Three model slots and host per-function .su/heuristics do not prove target WCET or
whole-stack budget. Basic/FP/alignment/lazy exception conditions prevent treating
32bytes as a maximum per interrupt. No hardware or physical paper was tested.
PM0214 Rev10 March2020 selected text; CMSIS5.9.0 pinned2b7495b8535bdcb306dac29b9ded4cfb679d7e5c;
DeviceF4 v2.6.10 pinned5f41fb29d22773896c780052bf61e47fc924d524; WG14 N1570 April2011 draft.
Researcher manual text/pixels retain their attribution; current official RM0090 is
unread, current PM/DS/AN pixels and current selected silicon errata/target contracts
remain gaps. Local candidate and native checks do not prove public release/mastery.

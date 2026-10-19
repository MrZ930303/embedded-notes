DMA ownership — original finite host-C producer, unit16

Files: dma.c + dma.h + this README.txt. No other native dependency.
Requires existing hosted C11 compiler with exact uint16_t/uint32_t/uint64_t.
This example performs sequential fake events, not target DMA, IRQ, MMIO or threads.
No heap/main/callback/busy-wait exists in production dma.c. A separate caller supplies main.

Save dma.c and dma.h in one directory. Copy only the text between the following
BEGIN/END markers to a new file named consumer.c in that same directory.
Every needed consumer line is included here. No unavailable consumer.c is assumed.

----- BEGIN consumer.c -----
#include "dma.h"
#include "dma.h"
#include <stdio.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL line %d\n",__LINE__); return 1; } } while (0)
int main(void)
{
    static DmaState producer;
    DmaReport report={0};
    DmaToken transfer,lease;
    uint16_t copied[4]={0U,0U,0U,0U};
    const uint16_t expected[4]={10U,11U,12U,13U};
    uint32_t index;
    CHECK(dma_init(&producer,DMA_FIXTURE_NORMAL,false)==DMA_OK);
    CHECK(dma_start(&producer,&report)==DMA_OK);
    transfer=report.descriptors[0].token;
    for(index=0U;index<4U;index++) {
        CHECK(dma_push(&producer,expected[index],&report)==DMA_OK);
    }
    CHECK(report.ndtr==0U && report.descriptors[0].owner==DMA_WRITER && !report.tc);
    CHECK(dma_complete(&producer,&transfer,&report)==DMA_OK);
    CHECK(report.current==1U && report.ndtr==4U && report.tc);
    CHECK(dma_claim(&producer,&lease)==DMA_OK);
    for(index=0U;index<4U;index++) {
        CHECK(dma_read(&producer,&lease,index,&copied[index])==DMA_OK);
        CHECK(copied[index]==expected[index]);
    }
    CHECK(dma_release(&producer,&lease)==DMA_OK);
    CHECK(dma_begin_next(&producer,&report)==DMA_OK);
    CHECK(report.descriptors[0].owner==DMA_FREE && report.descriptors[1].owner==DMA_WRITER);
    CHECK(dma_request_stop(&producer,DMA_CAUSE_USER,&report)==DMA_OK);
    CHECK(dma_confirm_stop(&producer,&report)==DMA_OK);
    CHECK(dma_recover(&producer,&report)==DMA_OK && report.run==2U && report.phase==DMA_IDLE);
    CHECK(puts("PASS README DMA: copied 10 11 12 13; released; confirmed; recovered run2")>=0);
    return 0;
}
----- END consumer.c -----

From that directory, using an existing GCC-compatible compiler on PATH:
cc -std=c11 -Wall -Wextra -Werror -pedantic -c dma.c -o dma.o
cc -std=c11 -Wall -Wextra -Werror -pedantic -c consumer.c -o consumer.o
cc dma.o consumer.o -o consumer
./consumer

For Windows use your existing gcc executable in place of cc; choose consumer.exe
as link output, then run .\consumer.exe in PowerShell. These are generic commands,
not an instruction to install a compiler. Project acceptance routes each actual
compile/link via the existing mcu-build validate -> dry-run -> build tool and
records raw status, source/profile/tool/log/fresh-artifact SHA256.

Repeat with -DNDEBUG on BOTH compile commands, different output object/executable
names (for example dma-ndebug.o, consumer-ndebug.o, consumer-ndebug.exe), and link
those two matching objects. CHECK stays active; production does not use assert.
Do not execute an old executable after a failed compile/link.

Expected success output (normal and NDEBUG):
PASS README DMA: copied 10 11 12 13; released; confirmed; recovered run2

The public header is the complete contract. Real live initialized typed objects
and disjoint writable outputs are required. Do not edit inspectable state fields.
Fresh init requires no live old transfer/lease/events; it cannot erase ownership.
Lifetime domains of different fresh objects are caller-separated; never transfer
tokens between them. This is single-context, exclusive, non-reentrant host code.

Safe stages are explicit: start allocates A/WRITER; each push writes one item;
after push13 A is WRITER/valid4/NDTR0, no completion yet. complete with exact
transfer token publishes READY, asserts TC, flips CT=B/NDTR4. claim grants one
CONSUMER lease. read copies one item (no retained pointer); matching release frees
it. begin_next checks FREE and allocates the next block, with no item write.
If next block is READY/CONSUMER, LATE_REUSE requests stop before the next fake
write. This original SAFE_STOP_ON_REUSE handshake is not hardware DBM behavior.

Raw DBM is a separate public fake: fourth item auto-switches CT/NDTR and sets TC.
Hold raw A[10..13], finish B[20..23], then raw_push30 overwrites A[0] and marks a
logical violation. It executes no C data race. HT/TC are latches, not processing
acknowledgements; two vs four raw completions have the same CT/NDTR/HT/TC snapshot.

Run and block IDs are separate positive uint32 domains, never wrap/reuse within
an initialized object's lifetime. Init normal run1/nextRun2/nextBlock1. start or
begin_next allocates one block ID; recover allocates one run ID and never rewinds
nextBlock. Last MAX is usable; subsequent allocation returns EXHAUSTED preserving
state/output/history. Public fresh fixtures LAST_BLOCK, LAST_RUN and COUNTER_EDGE
reach those edges without editing live metadata or billions of calls.

Zero run/block token is INVALID_TOKEN, positive old/wrong identity STALE_TOKEN;
slot>=2 INVALID_ARGUMENT. read/release/complete reject preserving ownership and
output. A second claim returns BUSY while a lease exists; otherwise oldest READY
block ID is selected. Only DMA_OK refreshes claim/read output. Successful report
calls refresh metadata on DMA_OK, LATE_REUSE or TRANSFER_ERROR; rejected calls
retain old reports, which are history rather than fresh results.

USER/TRANSFER stop preserves initiating cause and the partial WRITER valid length
(INVALID). Completed READY/CONSUMER stay owned. Stop request is not confirmation.
Status and matching reads/releases remain available while stopped. Recover needs
independent backend confirmation AND no outstanding consumer, discards old READY,
clears lengths/flags and establishes a new idle run. A new start is separate.
Old completion/lease tokens cannot publish/read/release a new instance.

Numeric placement checks selected historical F407 SRAM1/2, count1..65535,
width1/2/4, alignment, count*width bytes, allocation extent and one-region span.
N4/16bit needs8B per block. CCM, odd16-bit address, six-byte extent and cross-region
span reject. Numeric MCU addresses are never cast/dereferenced as host pointers.
Passing numbers does not prove actual allocation lifetime, DMA reachability,
exclusive ownership or visibility. The actual fake arrays are host-owned objects.

Fixed resources:2 blocks x4 uint16 values,2 descriptors,1 lease,32 optional copied
history rows. History storage exists even if recording is disabled. Each successful
mutating call appends<=1row, except reads/status append0. Full history drops new
rows with a saturating historyDropped diagnostic and never stalls execution.
Unused slots initialize deterministically; reports always initialize both slots.
Diagnostics completed/observedTc/copiedItems/released/lateReuse/transferErrors/
discardedReady/historyDropped are separate. MAX-1->MAX is exact, no saturation;
the next attempted increment retainsMAX and sets sticky saturated. No exact loss
rate or processed-block claim follows from these values.

Limits: source/model/native/browser evidence differs from hardware/publication.
Historical RM0090 Rev5 Table44 gives F407 ADC1 DMA2 stream0or4/channel0. Current
official RM, current selected silicon DMA/ADC errata, current DS/PM/AN pixels,
real linker placement/concurrency/backend stop/WCET/maximum target stack and
physical sampling/wire/cache/paper remain unverified. F407 Flash I/D-code
accelerator is not M7 SRAM L1 D-cache. No target maintenance recipe is included.

Original embedded-notes C11 cooperative host example. No third-party ownership claimed.
Preserve examples/ sibling layout. Owned: driver-recovery/recovery.c/.h,
fake_sensor.c/.h, terminal.c/.h. Borrowed unchanged actual sources/headers:
bounded-fifo/fifo.c/.h, timer-pwm/time.c/.h, uart-framing/uart.c/.h,
adc-sampling/adc.c/.h. No textual .c inclusion, test main, callbacks or hardware.

From a repository checkout with existing Node, C compiler, Python and mcu-build:
node scripts/test-driver-recovery.mjs --native --compiler <existing-gcc> --python <existing-python> --router <existing-build_router.py>
Without --native, the repeatable runner uses pure Node to verify the actual
JavaScript model/controller, exact source/mirror/download bytes and print scripts;
it does not probe C tools, create C artifacts or exit an importing aggregate.
With --native, it validates a custom profile, dry-runs it, then builds every experiment
through mcu-build. It separately compiles seven actual modules and a consumer
that includes every header twice, links and runs normal and NDEBUG checks.
Raw return/log/profile/tool/source/header/fresh-artifact SHA records stay in
.scratch/protocol-acquisition/c-evidence. Any nonzero status is failure; never run
a stale executable. No installation or upgrade is required or authorized.

For a standalone download, save the complete consumer below as consumer.c in
examples/. Underlying existing-compiler command form (use .exe on Windows):
cc -std=c11 -Wall -Wextra -Werror -pedantic -I. -Itimer-pwm -c bounded-fifo/fifo.c -o fifo.o
Repeat the same strict compile form for time.c, uart.c, adc.c, recovery.c,
fake_sensor.c, terminal.c and consumer.c, with their actual paths. Link the eight
separate .o objects: cc fifo.o time.o uart.o adc.o recovery.o fake_sensor.o terminal.o consumer.o -o terminal-demo
Repeat the whole build with -DNDEBUG and run both fresh outputs.
On AgentHub EVERY compile/preprocess/assemble/link/binary experiment, including
these underlying forms, MUST use an existing mcu-build custom profile:
python <existing-skill>/scripts/build_router.py validate --config <profile.toml>
python <existing-skill>/scripts/build_router.py build --config <profile.toml> --dry-run
python <existing-skill>/scripts/build_router.py build --config <profile.toml>
Set explicit existing tool, workspace, command array, log and fresh artifacts.

One exclusive initialized manager, backend and actual ADC; no retained caller
payload pointer. All nonnull pointers real/live/typed, outputs writable/disjoint
from every other call object including nested members. Fresh init requires new
storage AND token domain with no old live operation/event. Never overwrite a live
quarantine or copy an owner to run twice. Null/metadata checks cannot verify
forged pointers, overlap or arbitrary corruption. Single context, non-reentrant.

FAKE seeds/register/counter/value max1000000. ADC mode fake seeds must be0.
FAKE READ/INCREMENT value0 and ADC fields0; ASSIGN repeats copied same value.
ADC SAMPLE value0 validated by actual adc_plan and adc_quantize. Config backend
fixed for lifetime. firstToken1..UINT32_MAX; never wrap/reuse even across reset.
MAX-1 is a public finite near-exhaustion fixture; diagnosticSeedMAX is a synthetic
saturation fixture, normal seed0. NONE token0/causeNONE; explicit inputs positive
token and mode-appropriate kind/cause. Unused or unpolled input is not queued.

Admission0 actions/attempt0. Service0..1 port action/0..1 ADC lifecycle call.
Total3 attempts,20ms each,5ms wait AFTER confirmed cleanup,100ms total,20ms
cancel within total. Equality expires; precedence validation/time -> total ->
current cancel/attempt -> retry eligibility/wait -> one action. True forward gap
<2^31 ticks is a caller promise, 1tick=1ms. Observed delta>=2^31 rejects before
named mutations; equal time valid, unseen full wraps not detected. Terminal ages
freeze; timeout completion requires time progress and scheduling.

Cancel accepted != cleanup confirmed. Active actual ADC cancels only on later
cancel-poll, exactly one adc_cancel; prior producer error already inactive is
released by later fact-only cancel-poll with0 ADC calls but still1 port action.
Manager keeps wrapper ownership until that confirmation. Deadline before release
quarantines/retains request/token; no later backend actions, submit/reset LOCKED,
status available. Fresh init cannot erase live quarantine. No physical abort or
remote-effect undo. Unexpected producer return after valid dispatch is a valid
CONTRACT_FAULT quarantine, not preserving BAD_STATE or fabricated cleanup.

Call errors preserve every named state/output. Valid failures transition with
RECOVERY_OK and typed snapshot. Only report.resultPresent authorizes separate
fresh result; otherwise unchanged. Historical committed/first+last failure stay
explicit. cleanup/terminal reason never overwrites original cause/phase/age/token.
reset clears job metadata but preserves diagnostics/token history/fake values/
manager committed and actual ADC committed. status is action-free, ages unadvanced.

READ/ASSIGN replay only declared timeout/NACK/OVERRUN/LOST_REPLY after cleanup;
READ stable exclusive register, no read-clear/FIFO. SAMPLE same copied host input
replays timeout/ADC_BACKEND/ADC_TIMEOUT. INCREMENT never auto-replays: lost reply
counter1 -> UNSAFE_EFFECT; independent blind replay counter2. All failures first
cleanup; no universal hardware read/write safety or GPIO bus recovery is implied.

Three event slots; zero unused slots. Optional32-report static trace drops newest
row33 with TRACE_DROPPED plus saturated dropped count; manager continues. Seven
uint32 diagnostics saturate with sticky attempted-overflow flag. No heap, growing
history, recursion, sleeps, callbacks, unbounded waits or catch-up loop.

Actual UART status A5 01 02 03, period100 unchanged. Scheduler supplies at most4
ingress calls per turn; turn calls actual uart_poll once before job service.
Application response copies post-service snapshot, not a new wire packet. Top-level
argument/input-shape rejection preserves whole turn; independent component statuses
and report-valid flags do NOT promise atomic rollback. resultPresent and
responsePresent authorize different outputs. All static source matches downloads.

Native and JavaScript evidence are separate. Host .su/sizeof/heuristic/manual
review do not establish target maximum stack, electrical recovery, accuracy,
WCET, throughput, hardware, physical paper, personal mastery or publication.

Complete standalone actual UART+ADC public-interface consumer:
#include "driver-recovery/terminal.h"
#include <stdio.h>
int main(void)
{
    RecoveryTerminal terminal;
    RecoveryConfig config={RECOVERY_BACKEND_ADC,1U,0U,0U,0U};
    RecoveryRequest request={RECOVERY_SAMPLE,0U,{12U,15U,4U,3300000U,1650000U}};
    RecoveryInput none={RECOVERY_INPUT_NONE,0U,RECOVERY_CAUSE_NONE};
    RecoveryInput advance={RECOVERY_INPUT_ADC_ADVANCE,1U,RECOVERY_CAUSE_NONE};
    RecoveryTurnReport turn;
    RecoveryStatusResponse response;
    RecoveryValue value={0};
    UartIngress ingress;
    const uint16_t bytes[]={165U,1U,2U,3U};
    if(recovery_terminal_init(&terminal,&config,100U,0U)!=RECOVERY_OK ||
       recovery_submit(&terminal.job,&request,0U)!=RECOVERY_OK ||
       recovery_terminal_turn(&terminal,0U,&none,&turn,&value,&response)!=RECOVERY_OK) {return 1;}
    for(size_t i=0U;i<4U;i++) {
        if(recovery_terminal_receive(&terminal,bytes[i],&ingress)!=UART_OK) {return 1;}
    }
    if(recovery_terminal_turn(&terminal,0U,&advance,&turn,&value,&response)!=RECOVERY_OK ||
       !turn.uartReportValid || !turn.uart.commandPresent || !turn.responsePresent ||
       response.periodMs!=100U || response.job.category!=RECOVERY_CATEGORY_PENDING) {return 1;}
    for(uint32_t tick=1U;tick<=2U;tick++) {
        if(recovery_terminal_turn(&terminal,tick,&advance,&turn,&value,&response)!=RECOVERY_OK ||
           !turn.jobReportValid || turn.job.backendActions>1U || turn.job.producerCalls>1U) {return 1;}
    }
    if(!turn.job.resultPresent || value.sample!=2048U) {return 1;}
    if(puts("PASS actual UART status100 while ADC pending; actual sample2048")<0 || fflush(stdout)!=0) {return 1;}
    return 0;
}

Unit13: original floor-bin arithmetic and bounded host fake ADC

Files: adc.c, adc.h, plus the unchanged unit10 time.c and time.h.
Download all four into one directory. adc.c includes both public headers.
The implementation has no main, heap, recursion, callbacks or hardware access.
An independent C caller includes adc.h, initializes AdcState with adc_init,
starts an AdcRequest, and supplies one event/time observation per adc_poll.
Example request: {12,15,4,3300000,1650000}. Start at0; ADVANCE at0,1,2
returns PENDING,PENDING,READY with samplePresent=true and sample=2048.
These replay milliseconds are not the nominal 27/21MHz converter duration.

Save the complete block below as consumer.c in that same directory. Copy only
the lines between the markers; the marker lines are not C source. This caller
checks every return value and the fresh-result flag without relying on assert.

----- BEGIN consumer.c -----
/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file consumer.c
 * @author embedded-notes contributors
 * @brief Minimal independent caller for the public finite host ADC interface.
 * @version V1.0 2026-10-19
 *****************************************************************************/
#include "adc.h"
#include <stdio.h>

/**
 * @brief Run one copied request through the three public fake conversion phases.
 * @param[in] None.
 * @return Zero on the fixed success trace; nonzero on any failed check or output.
 */
int main(void)
{
    AdcState state;
    const AdcRequest request = {12U, 15U, 4U, 3300000U, 1650000U};
    AdcReport report = {ADC_OK, ADC_IDLE, 0U, false, 0U};

    /** All runtime checks remain active when NDEBUG is defined. **/
    if (adc_init(&state) != ADC_OK || adc_start(&state, &request, 0U) != ADC_PENDING) {
        return 1;
    }
    if (adc_poll(&state, 0U, ADC_EVENT_ADVANCE, &report) != ADC_PENDING || report.samplePresent) {
        return 2;
    }
    if (adc_poll(&state, 1U, ADC_EVENT_ADVANCE, &report) != ADC_PENDING || report.samplePresent) {
        return 3;
    }
    if (adc_poll(&state, 2U, ADC_EVENT_ADVANCE, &report) != ADC_READY ||
        !report.samplePresent || report.sample != 2048U) {
        return 4;
    }
    if (puts("PASS ADC README: PENDING PENDING READY, samplePresent=true, sample=2048") < 0 ||
        fflush(stdout) != 0) {
        return 5;
    }
    return 0;
}
----- END consumer.c -----

For a conventional local compiler, separate translation units can be built:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c adc.c -o adc.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c time.c -o time.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c consumer.c -o consumer.o
  cc adc.o time.o consumer.o -o consumer
Run ./consumer (or consumer.exe on Windows). Success returns0 and prints:
  PASS ADC README: PENDING PENDING READY, samplePresent=true, sample=2048
Repeat with -DNDEBUG on all translation units. Checks must remain active.
AgentHub execution must route every compile/preprocess/assemble/link through
mcu-build custom profiles: validate -> build --dry-run -> build. Preserve
raw status, source/header/tool/profile/log/fresh-artifact hashes. Never run
an old artifact after a failed build. No dependency installation is needed.

Repository behavioral check: node scripts/test-adc-sampling.mjs
That check executes the actual JS model/controller and print scripts.
Its --native option uses the existing compiler, Python and mcu-build router
selected by --compiler, --python and --router; see --help. The native consumer
includes each public header twice and links separately compiled adc/time.

Integer floor model, not a physical transfer guarantee:
bits6/8/10/12; reference1..3600000uV; input0..reference inclusive.
code=min(2^bits-1,floor(input*2^bits/reference)); widen before multiplying.
Maximum product14745600000 fits uint64_t and exceeds uint32_t.
adc_reconstruct returns exact numeratorUv/denominator. endpoint=false uses
2^bits (lower edge); true uses2^bits-1 (endpoint interpolation). Request
values are validated even when input does not affect the reconstruction.

adc_plan uses fixed PCLK2=84MHz and an assumed, unverified F407VG/LQFP100
wired VDDA=VREF+=3.3V with the selected36MHz bound. Dividers2/4/6/8 give
42/21/14/10.5MHz; divider2 is rejected in this fixture. Sample cycles are
3/15/28/56/84/112/144/480. Arithmetic voltage domain is not a hardware
reference-voltage approval. No register/pin/clock configuration is performed.

adc_start copies the request, retains no caller pointer, preserves committed
sample, and establishes a new time-observation domain. Busy takes precedence
over inspecting a replacement request. Other rejections preserve all named
state/output fields. adc_poll advances at most one of ACQUIRE/CONVERT/RESULT.
WAIT immediately returns PENDING. report.phase is the serviced/failed phase;
state.phase is the next phase. Only READY sets samplePresent and commits.
READY, backend error and timeout synchronously release the fake operation.
Terminal poll returns BAD_STATE and preserves report (including any old
samplePresent flag); consume output only after this call returns READY.

time_elapsed is the actual unit10 implementation:1tick=1ms, true forward
inter-observation gaps strictly below2^31 are a caller promise. Observed
delta>=2^31 rejects before mutation. Equal ticks are valid; unseen whole
wraps are undetectable. Age>=20ms expires before accepting a supplied event;
stored age saturates at20. Progressing time and service scheduling are needed
for eventual timeout. This is no measured hardware or scheduler deadline.

adc_cancel only accepts active initialized state. It synchronously clears
active/candidate, sets terminal/CANCELLED, preserves committed/hasSample and
returns samplePresent=false. IDLE/READY/error/timeout/previously-cancelled
objects reject BAD_STATE unchanged; terminal objects already released all
fake local resources. This is not asynchronous cancel acceptance, physical
abort, undo of remote effects, generation protection or real recovery.

All nonnull pointers must name real, live, correctly typed objects. Outputs
are writable/disjoint from all other objects in the call. adc_init accepts
genuinely fresh storage without reading its old fields; never initialize
over a live operation. Other calls require initialized state. Single-context,
exclusive, non-reentrant ownership. Null/metadata checks cannot validate
forged pointers, dishonest extents, aliasing violations or arbitrary memory.

Storage: one20-byte five-uint32 request, one uint16 candidate, one uint16
committed code, two uint32 time fields, phase/status and two bool flags;
ABI padding/enum widths are implementation-defined (use sizeof locally).
No retained event queue or growing history. A poll uses constant work and
no loop. Browser replay is at most3 rows, replacing one row at a time.
Host .su and the stack heuristic/manual review are qualified local evidence,
not target/whole-program maximum stack. No physical measurement, silicon
errata audit, current DS/AN table/formula pixel review or paper inspection.

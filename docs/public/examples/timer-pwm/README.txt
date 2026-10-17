timer-pwm — original embedded-notes C11 teaching model, 2026

Download timer.h, timer.c, time.h and time.c into one directory. Keep the public
headers beside their implementations; do not include a .c file in another .c.
An existing conforming C11 compiler with uint32_t, uint64_t and int64_t is required.
No software installation is part of the example.

Ordinary reproduction commands for a human at a compiler-enabled terminal:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -DTIMER_TEST timer.c -o timer-test
  ./timer-test
  cc -std=c11 -Wall -Wextra -Werror -pedantic -DTIME_TEST time.c -o time-test
  ./time-test
Repeat both compiler commands with -DNDEBUG; checks must still execute.
On Windows use the matching existing compiler and executable filename.
Reusable modules (no test main):
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c timer.c -o timer.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c time.c -o time.o
Include the appropriate public header in a separate initialized caller and link
its object with the original module object. Output/result objects must not alias
any other argument object. No implementation is textually included.

AgentHub execution uses the existing mcu-build custom profile route for EVERY
compiler/linker operation: validate, build --dry-run, then build. The parent batch
runner accepts existing compiler/router/Python paths and keeps fresh per-run
profiles, actual return codes, compiler diagnostics, input/output hashes and
before/after source/header hashes. A failed build never executes an old artifact.
The generic commands above describe reproducibility, not a bypass of that route.

Timer scope: STM32F407VG TIM3, 16-bit PSC/ARR/CCR, internally clocked edge-up PWM1,
active-high OCxREF. Source1..84000000Hz is supplied nominally from a separately
qualified clock plan, not established by this arithmetic. PSC0..65535,
ARR1..65535 (ARR0 blocks the selected counter), duty0..10000 basis points.
Rounding is nearest integer compare, ties upward. compare65536 is explicitly
TIMER_NOT_REPRESENTABLE. No clamp claims100% at ARR65535.
  counter frequency = source/(PSC+1)
  PWM frequency = source/((PSC+1)*(ARR+1))
  achieved duty = compare/(ARR+1)
  signed duty error = errorNum/errorDen
84MHz/PSC83/ARR999/duty2500bp gives CCR250, divisor84000,1kHz and25%.
N3 duty5000/1000/9000 gives CCR2/0/3, errors5000/-3000/3000 over30000.
Maximum divisor65536*65536=4294967296 fits uint64_t, not uint32_t.
Duty product plus5000 is <=655365000; all selected signed error terms fit int64_t.

The finite trace is HOST POLICY: seed active83/999/250 at CNT500. Stage a complete
validated preload at phase0; then four steps: PRELOAD_WAIT, UDIS_UG_HOLD,
URS_UG_TRANSFER, OVERFLOW_FINISH. UDIS suppresses shadow transfer; UG can reset
counter/prescaler. URS filters IRQ/DMA request sources, not the UG event. The
third step transfers under UDIS0/URS1; the fourth is an allowed overflow request
source and terminal. No actual request/interrupt or pin waveform is generated.
The complete tuple is a model policy, not physical atomic multi-register writes.
For continuous PWM, historical selected-device clauses require OCxPE; ARR depends
on ARPE, PSC is buffered. Midperiod UG is not promised glitch-free.

Time scope: one tick=one millisecond in the shared UART fixture. The caller must
guarantee true forward gaps between accepted observations strictly <2^31 ticks.
Observed modulo delta>=2^31 is TIME_GAP_REJECTED, preserving all named state/output
fields. Equal samples cannot detect a whole unseen wrap or dishonest real gap.
period1..2147483647, remainder<period; init reads no old contents. Service computes
total=oldRemainder+delta, releases=total/period, remainder=total%period. It returns
at most one work item and missed=releases-1 when releases>0; otherwise missed0.
Validated total<=4294967293 fits uint64_t. No loop per release or signed-cast trick.
P10/start100 with109/110/145 gives (work,missed,remainder):
  (false,0,9), (true,0,0), (true,2,5); repeated145=(false,0,5).
4294967290->4 gives delta10 across wrap. These are fixed independent fixtures.

All pointer preconditions require real live correctly typed storage and honest
extent; null checking is not arbitrary pointer validation. Non-init state calls
require initialized metadata. Single context, exclusive ownership, non-reentrant.
No heap, recursion, sleep, busy wait, MMIO, callbacks, IRQ, DMA or physical I/O.
Production functions have fixed work/storage; optional tests have fixed bounds.
Output failure makes test main return nonzero; no correctness check uses assert.

Primary evidence read2026-10-17: ST historical RM0090 DocID018909 Rev5 Sep2013,
F405/407-specific §7.2p213; TIM3 §18.2p576, §18.3.1/.2/.9pp577-579/595-596,
§18.4.1p612, §18.4.7p622, §18.4.11/.12/.13pp627-628. DS8626 Rev12 Mar2026
§3.21/Table4pp33-35 text-only corroboration; ST CMSIS DeviceF4v2.6.10 F407 header,
commit5f41fb29d22773896c780052bf61e47fc924d524; ST HALv1.8.5 LL TIM header,
commitb6f0ed3829f3829eb358a2e7417d80bba1a42db7. Unsigned/conversion reasoning:
WG14 N1570 public draft2011-04-12 §6.2.5/.3.1.1/.3.1.3 and §7.20.1.1.
Current official RM retrieval failed boundedly; its current clauses remain unread.
DS table pixels and selected silicon errata were not fully audited. Host checks,
heuristic stack checks and per-function .su do not prove target stack/WCET/tick
accuracy, electrical output, oscillator jitter, glitch-free updates or hardware.

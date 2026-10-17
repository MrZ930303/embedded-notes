clock-timebase — original embedded-notes C11 teaching model, 2026

Files: clock_plan.h interface; clock_plan.c reusable implementation and optional
CLOCK_PLAN_TEST host entry. Original project work, no third-party authorship or
new third-party license grant is asserted. No vendor driver is bundled.

Prerequisite: an existing C11 compiler supporting uint32_t/uint64_t/int64_t.
From this directory (use .exe on Windows as appropriate):
  cc -std=c11 -Wall -Wextra -Wconversion -Wshadow -Werror -pedantic -DCLOCK_PLAN_TEST clock_plan.c -o clock-test
  ./clock-test
  cc -std=c11 -Wall -Wextra -Wconversion -Wshadow -Werror -pedantic -DCLOCK_PLAN_TEST -DNDEBUG clock_plan.c -o clock-ndebug
  ./clock-ndebug
  cc -std=c11 -Wall -Wextra -Wconversion -Wshadow -Werror -pedantic -c clock_plan.c -o clock_plan.o
Where a project requires mcu-build, put these exact commands in its approved
custom profiles and perform validate -> build --dry-run -> build. All author
compiles used that route; standalone commands here describe reproducible flags.
Expected success line:
PASS unit09: rational clocks, tick boundaries, UART rounding, bounded up/down/fault switch
Any failed expectation or output/flush failure exits nonzero; checks use no assert.

Without CLOCK_PLAN_TEST there is no main. Include clock_plan.h, compile/link
clock_plan.c with your own program. Check each status before using a new output.
clock_plan, clock_tick and clock_uart commit only on CLOCK_OK; all other statuses
preserve output fields. clock_switch_begin writes a complete initialized fake
state on OK; invalid arguments preserve it. clock_switch_step mutates a begun
state and can finish with a failure report; it does not roll back real hardware.
After terminal, step returns DONE without advancing. Normal readiness is second
observation, limit1..3. HSI availability and successful fallback observation are
script assumptions; failure ends HSI16MHz with APB/16, never accepted target.
Fixed up: HSI16/Scale2/WS0 -> HSE8 M8 N336 P2 Q7 / AHB1 APB4/2 /168MHz Scale1 WS5.
Fixed down: PLL168 Scale1 WS5 -> same HSE M/N with P4 /84MHz APB2/1 Scale2 WS2.
PLLI2S is explicitly disabled and no other consumer is present in both fixtures.

Caller contract: non-NULL pointers designate live, correctly typed initialized
real objects. Writable output must not overlap inputs. Begin is allowed on fresh
uninitialized storage because it does not read old fields; step requires begun
state. Single execution context, no reentry/concurrent access. Null checks do not
validate forged/dangling pointers, dishonest lengths, aliases or object lifetimes.
Tests use initialized real storage, not invalid-address execution. Reports are
compared by named fields, not structure padding.

Device/scope: STM32F407VG nominal internal-regulator planning, VDD2700..3600mV,
Scale1 HCLK<=168MHz, Scale2<=144MHz, PCLK1<=42MHz, PCLK2<=84MHz. Sources are HSE
crystal4..26MHz, bypass1..50MHz or nominal HSI exactly16MHz. Source electrical
waveform, temperature and supply footnotes still apply and are not validated.
Conservative shared-evidence teaching policy: PLL input1..2MHz, N192..432,
VCO192..432MHz. POLICY does NOT mean all excluded settings are physically invalid:
DS8626Rev12 March2026 has input0.95..2.10MHz/VCO100..432, HALv1.8.5 N50..432
(F411 exception min192), historical RM0090Rev5 Sep2013 has N/VCO minimum192.
Current official RM revision was not read. Discrete M2..63/P2,4,6,8/Q2..15;
AHB1,2,4,8,16,64,128,256,512; APB1,2,4,8,16. Q48=1 requires exact48MHz;
Q output is limited to DS maximum75MHz. Q48=0 reports an unused branch and grants no peripheral compliance.
Flash band2700..3600mV: HCLK up to30/60/90/120/150/168MHz requires0/1/2/3/4/5WS.
Calculate retains rational Hz, rejects overflow before multiply; bounded fields
make subsequent uint64_t products finite. Browser uses safe-integer Number input,
reports OVERFLOW before losing integer exactness; C exposes uint64_t sourceHz.

SysTick: caller supplies chosen source as positive rational Hz; F407 allows HCLK
or HCLK/8. Exact periodic count must be2..16777216, LOAD=count-1. Count1 encodes
LOAD0 but returns NO_EVENT, not an interrupt-every-clock promise. Zero or excess
returns RANGE; fractional count returns INEXACT with no rounded setting committed.
UART: uint32_t busHz/baud, OVER8=0; requested baud<=busHz/16 and rounded effective
divisor16..65535; nearest divisor ties upward. BRR=D, mantissa=D/16,fraction=D%16.
Achieved baud is a ratio; errorNum/errorDen=(actual-requested)/requested. No
universal2% receiver promise. UART PCLK1=42MHz differs from APB1 timer84MHz.

F407 VOS and VOSRDY are bit14 (RMRev5 pp138-139, pinned DeviceF4v2.6.10 header).
HALv1.8.5 F407 PWREx writes VOS and waits VOSRDY without PLL-off requirement for
that voltage operation. PLL coefficient/source changes separately require the
appropriate disabled PLL(s), HSEBYP only with HSE off. Lower HCLK before Scale1
to2; Scale2 to1 readiness before raising. The fake bridge exists for PLL rewrite.

This is nominal host arithmetic and scripted state only: no MMIO, no STM32 clock
driver, target startup, physical PLL lock, voltage/Flash behavior, oscillator
accuracy/jitter, UART waveform, hardware validation or USB compliance claim.
Record compiler identity, command/status, source hashes and fresh artifact hashes.
Host execution, browser checks, site build, review, publication and hardware are
separate evidence states. This unit is a local candidate pending root integration.

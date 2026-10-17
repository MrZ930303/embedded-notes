Memory budget: original bounded C11 teaching models
Embedded Engineering Notes project, 2026-10-17. No third-party authorship or
new license grant is asserted. Read the repository's applicable terms.

Files: memory_budget.h, memory_budget.c, stack_probe.c, README.txt.
Prerequisite: an existing C11 compiler; GCC is needed for -fstack-usage.
No board, MMIO, dynamic host allocator, recursion or active-stack scan is used.

Run from the directory containing all four files (Windows executables use .exe):
cc -std=c11 -Wall -Wextra -Werror -pedantic -DMEMORY_BUDGET_TEST memory_budget.c -o budget-test
./budget-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DMEMORY_BUDGET_TEST -DNDEBUG memory_budget.c -o budget-ndebug
./budget-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c memory_budget.c -o memory_budget.o
gcc -std=c11 -Wall -Wextra -Werror -pedantic -O0 -fno-inline -fno-optimize-sibling-calls -fstack-usage -c stack_probe.c -o probe.o
gcc -std=c11 -Wall -Wextra -Werror -pedantic -O0 -fno-inline -fno-optimize-sibling-calls -DSTACK_PROBE_TEST stack_probe.c -o probe-test
./probe-test
arm-none-eabi-gcc -std=c11 -Wall -Wextra -Werror -pedantic -mcpu=cortex-m4 -mthumb -mfloat-abi=soft -O0 -fno-inline -fno-optimize-sibling-calls -fstack-usage -c stack_probe.c -o probe-arm.o

Stop immediately if any compile or execution returns nonzero. Never run a stale
executable after failure. Keep outputs in a fresh private directory if comparing
builds. An engineering workspace requiring mcu-build must configure these same
compiler argv as custom profiles and execute validate -> build --dry-run -> build.
The public commands describe arguments, not permission to bypass such a route.
This chapter's actual compilation uses that route; no helper compiles secretly.

Expected main summary:
PASS memory budget: envelope, rational, lifetime, fragmentation, maximum path, unknown, preservation
Expected probe summary:
PASS bounded stack probe: 32 and 270; compiler frames are separate evidence
Runtime checks and checked stdout/stderr flushing remain active with NDEBUG.

To reuse: include memory_budget.h, compile memory_budget.c without
MEMORY_BUDGET_TEST and link its object with your own caller. There is no main in
that build. Inputs/output/state must be real live objects of their truthful
extent, mutually non-overlapping. Functions are single-context, non-reentrant.
NULL checks cannot detect forged/dangling pointers, dishonest spans or races.
MemoryHeap must come from memory_heap_init, then only memory_heap_step may alter
its representation. Caller corruption is outside the contract. No payload
storage/pointer is returned: slots are integer metadata for eight named objects.

memory_envelope: data+BSS+reserved heap+reserved stack+guard, no live bytes added
again. FITS includes equality; EXCEEDS writes used/remaining=0/excess. INVALID
and OVERFLOW preserve report. All fields use size_t. Zero capacity/all-zero
reservation is permitted. Alignment/padding must already be in declared regions.

memory_scale_ceil: ceil(value*numerator/denominator). Denominator zero is INVALID.
The selected intermediate product must be representable; a reducible ratio can
still return OVERFLOW. Failure preserves result. Check before multiplication
and do not use (product+denominator-1)/denominator, which can overflow again.

memory_stack: 1..8 alternative paths, each 1..16 frame costs; max(sum(frames)*
repetitions)+irqBytes*irqNesting. All frame numbers are declared costs, not MCU
measurements. repetitions=0 or known=false, or irqKnown=false, returns UNKNOWN
and preserves report. Counts/pointers invalid -> INVALID first; then missing
bounds -> UNKNOWN; then checked arithmetic -> OVERFLOW; then FITS/EXCEEDS with
new report. A repeated path is a conservative bound for that whole sequence,
not automatic discovery of recursion depth. Complete IRQ cost includes selected
hardware frame, alignment, handler calls, optional FP state and nesting.

memory_heap_init: capacity may be zero; alignment must be a nonzero power of 2.
memory_heap_step: slot0..7, allocation positive payload and unused slot; release
requires live slot. span=round_up(payload+overhead, alignment); first-fit takes a
contiguous gap, adjacent free gaps implicitly coalesce. Allocator metadata itself
is outside this fictional arena; overhead is a declared per-allocation model.
Only FITS commits heap AND report; EXCEEDS/INVALID/OVERFLOW preserve both. Compare
named fields/bytes after a rejected transaction; a retained report is OLD state.

Independent fixtures:
1024=128data+256BSS+256heap+256stack+128guard, remaining0; guard129 ->1025, excess1.
Call path80+64+32=176; sibling80+48=128; maximum176, not304; IRQ64 ->240,
stack256 ->16 free. Repeated path twice with IRQ32*2 ->416. Unknown is not0.
Heap128/overhead0/alignment1: A32,B32,C32,D32 at0,32,64,96; releaseA thenC ->
64free but largest32; E48 rejects. ReleaseB ->96contiguous; E48 now succeeds,
live80/free48/peak128. With overhead4/alignment8, each payload5 consumes16.

Actual local host observation: MinGW GCC13.1.0 x86_64, strict flags above,
probe.o -O0 -fno-inline -fno-optimize-sibling-calls -fstack-usage:
probe_leaf48 static; probe_middle96 static; stack_probe112 static, bytes.
Line numbers/path prefixes in .su depend on source location. These are three
per-function compiler reports, not global worst-case, library coverage, target
measurement or high-water marks. Optional object-only cross-compilation using
GNU Arm Embedded GCC10.3.1 20210824, Cortex-M4 Thumb, soft float, same O0 and
no-inline/no-tail-call stack-usage flags: probe_leaf40 static, probe_middle64
static, stack_probe80 static. It produced an unlinked object, never executed.
The default sandbox first refused tool launch (WinError623); a scoped approved
execution context succeeded using the identical installed compiler and router.
That difference is execution-context evidence, not an installation diagnosis.
No install, system-setting change or hardware operation followed. A target
compiler report is still not target execution, runtime/library/IRQ coverage or
global worst-case proof. The optional ARM command needs an existing toolchain.

GCC10.3/13.1 .su qualifiers: static=fixed frame; dynamic,bounded=reported upper
bound including dynamic adjustments; dynamic without bounded=bounded part only.
Inspect target/options/inlining, call graph, libraries and interrupt nesting
before combining reports. The arithmetic toy costs80/64/32/64 are independent
of actual probe frames48/96/112. Do not substitute one evidence kind for another.
AAPCS32 2025Q1: SP mod4=0 at all times, mod8=0 at public interfaces. Cortex-M4
PM0214 Rev10 exception base frame is eight words (32 bytes); alignment and FP
extension depend on configuration/state, and handler software frames add more.
No actual target bound, stack watermark, physical print or hardware fit is proved.

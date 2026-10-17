UART framed-command host reference (original embedded-notes teaching code)
Scope: C11, 8-bit bytes, exact uint8_t/uint16_t/uint32_t/uint64_t; host-only.
No MMIO, UART peripheral, physical wire, ISR/DMA/task, target or concurrency validation.

Download all seven files and retain this sibling directory layout:
examples/
  uart-framing/uart.c
  uart-framing/uart.h
  uart-framing/README.txt
  bounded-fifo/fifo.c
  bounded-fifo/fifo.h
  timer-pwm/time.c
  timer-pwm/time.h

Use an already installed C11 compiler. Do not include .c implementation text.
From examples/, generic underlying command forms (choose existing compiler):
cc -std=c11 -Wall -Wextra -Werror -pedantic -DUART_TEST uart-framing/uart.c bounded-fifo/fifo.c timer-pwm/time.c -o uart-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DUART_TEST -DNDEBUG uart-framing/uart.c bounded-fifo/fifo.c timer-pwm/time.c -o uart-test-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c uart-framing/uart.c -o uart.o
Run ./uart-test and ./uart-test-ndebug (Windows: use .exe and .\ spelling).
The active summary begins PASS UART:. A nonzero exit is failure; never run a stale artifact.
Without UART_TEST no test main exists. Link uart.c, original fifo.c and time.c
as separate translation units with your own main; repeated inclusion of uart.h is supported.
The examples use their relative sibling header paths, so preserve the layout.

On an AgentHub environment, every compilation/link experiment, including these
underlying command forms, goes through existing mcu-build custom profiles:
  python <existing-skill>/scripts/build_router.py validate --config <profile.toml>
  python <existing-skill>/scripts/build_router.py build --config <profile.toml> --dry-run
  python <existing-skill>/scripts/build_router.py build --config <profile.toml>
Configure an existing compiler, explicit workspace, command, log path and fresh
artifact path; record raw statuses, source/header hashes and executable/object hashes.
The site batch runner documents existing compiler/router/Python arguments.
Do not install or upgrade tools merely to reproduce a check.

API: uart_init(state, initialPeriod1..1000, now); uart_receive(state, wideByte0..255,
ingressReport); uart_poll(state, now, report, command).
All nonnull pointers must be real live typed objects. Outputs are writable and
disjoint from state and one another. Init may receive fresh storage; later calls
require initialized exclusively owned state. Null checks cannot validate forged/
dangling pointers, false extents or forbidden overlap. Single execution context,
non-reentrant. volatile is not synchronization. Do not externally edit metadata.

Original frame: A5 LEN(1..8) payload[LEN] XOR(LEN,payload...), excluding A5.
No escape/terminator. Consume an invalid length or checksum once, then seek
a later A5. Embedded payload A5 is data. Total frame max11 bytes.
Opcode01 requires LEN3 + little-endian period1..1000 ms. Opcode02 requires LEN1
and returns status/current period without changing that period. Other semantics
reject even with correct XOR. XOR misses paired/reordered changes and is not
authentication, reliable delivery or guaranteed arbitrary-noise resynchronization.

uart_receive copies one byte into the actual four-slot FIFO. On full, fifo_push
first preserves its queue; UART_LOSS then deliberately discards queue+partial
parser and drops the failed byte (including A5). Application period survives.
Later fresh valid input may recover. Invalid arguments/state preserve every named
state/report field. UART_LOSS is an intentional transition, not preservation.

uart_poll checks time before drain, even empty. One tick=1 ms. Caller promises
true forward gaps between accepted observations <2^31. Observed delta>=2^31
rejects before queue/parser/application/output mutation; unseen full wraps cannot
be detected. Parser age starts at accepted A5 and resets at each expected byte
accepted by parser. Timeout at age>=20 ms discards partial first, then processes
queued bytes once. FIFO contains no arrival timestamps: all bytes in one poll
share now, so delayed drain can timeout close-on-wire bytes. This is service/
parser-observed inactivity, NOT a physical interbyte gap or hardware IDLE.

At most four consumed bytes and five events per poll (one timeout+four byte
events), at most one accepted command. report.commandPresent alone authorizes
consuming a new by-value command; partial/rejected input leaves caller command
unchanged. Acceptance remains reported even if later bytes are noise/rejection.
Diagnostics accepted/rejected/timeouts/losses saturate at UINT32_MAX; attempted
increment at maximum sets sticky saturated=true. No heap, recursion, waiting,
sleep, callbacks, hardware access, retry or per-missed-event catch-up loop.

Literal tests: period100 A5 03 01 64 00 66; status A5 01 02 03;
embedded marker period421 A5 03 01 A5 01 A6; period1 and1000;
compensating changes produce period357 A5 03 01 65 01 66 with same XOR66.
Also cover1..4-byte fragmentation, stream/coalescing and subsequent noise,
LEN0/9/255/A5, valid LEN8 unsupported command, checksum A5 consumption,
unknown opcode/wrong command length/period0/1001,19/20ms equality, wrap,
no-byte timeout, delayed buffered suffix, age reset, full/discard/drop/recovery,
invalid half-range observation and named-field/output preservation, counter
saturation,1000 all-noise four-byte polls. Checks remain active under NDEBUG.
Host/compiler stack records and heuristic checks do not establish target WCET
or maximum call-chain stack. Hardware and physical printing remain unverified.

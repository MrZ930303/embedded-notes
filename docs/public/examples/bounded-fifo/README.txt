bounded-fifo / fifo.c — original vendor-independent C11 teaching module

Prerequisites: an existing C11 compiler, CHAR_BIT == 8 and uint8_t.
Capacity: exactly four internally owned byte values (0..255).
head means next read, tail next write, count occupancy.
0 <= head,tail < 4; 0 <= count <= 4; tail == (head+count)%4.
Empty and full can both have head == tail; count distinguishes them.
Unused slots can retain stale bytes that are not queued values.

Interface:
fifo_reset(Fifo *queue)
fifo_push(Fifo *queue, uint8_t value)
fifo_pop(Fifo *queue, uint8_t *output)
Statuses: FIFO_OK, FIFO_FULL, FIFO_EMPTY, FIFO_INVALID_ARGUMENT, FIFO_BAD_STATE.
All failures preserve queue fields/slots and caller output. Check status before
using output; an unchanged old output is not a new item.
Reset writes zero slots and head=tail=count=0 without reading prior contents;
it can initialize a real writable object or recover initialized corrupt metadata.
NULL reset returns INVALID_ARGUMENT. Reset discards previously queued values.
push/pop require a real live writable initialized Fifo. Null queue and null pop
output return INVALID_ARGUMENT before queue access. BAD_STATE covers initialized
metadata range/consistency faults, not arbitrary object validity or corruption.
output must point to a live writable caller uint8_t outside the entire Fifo;
it must not overlap slots or metadata. No general alias/address checking exists.
Do not test dangling/forged pointers or read indeterminate objects via push/pop.
push copies the value, not a pointer. Source17 -> push -> source99 -> pop gives17.
The uint8_t parameter cannot recover an out-of-range value already converted by
the caller. Validate a wider integer before conversion if rejection is required.

Single thread, single execution context, non-reentrant. Not safe for concurrent
SPSC, tasks/ISR/DMA or overlapping calls. volatile does not fix synchronization,
ordering or atomicity. Index/count updates form one conceptual operation only
under this single-context condition. No allocation, waiting, blocking or retry.

Host commands (adapt executable suffix/invocation to your installed compiler):
cc -std=c11 -Wall -Wextra -Werror -pedantic -DFIFO_TEST fifo.c -o fifo-test
./fifo-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DFIFO_TEST -DNDEBUG fifo.c -o fifo-test-ndebug
./fifo-test-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c fifo.c -o fifo.o
Define FIFO_TEST only for the test executable. No main is emitted without it.
Checks remain active under NDEBUG; a failed expectation returns nonzero.
Projects requiring a build wrapper should express the same flags in that wrapper.

Actual local verification: installed GCC13.1.0, through mcu-build custom profiles,
validate -> dry-run -> build. Strict test, NDEBUG test and module builds exited0;
normal and NDEBUG runs exited0. Fixed14-row trace,0/255,null,real initialized bad
metadata,reset,snapshots of named fields and slots,sentinel,copy ownership,and
20000 deterministic operations against an independent linear-shifting oracle.
Expected output:
PASS FIFO: literal replay, boundaries, null, initialized corruption, snapshots, copy, 20000 steps

Fixed replay from empty/output165:
push17,34,51,68; reject push85 full; pop17,34; push85,102;
pop51,68,85,102; reject empty pop with output still102.

No GPIO/MCU/RTOS integration, real concurrency, electrical or hardware validation.
Browser JavaScript and host-C behavior are separate checks, not hardware signoff.

Source conditions: WG14 N1570 Committee Draft2011-04-12 sections6.2.4,6.3.1.1,
6.3.1.3,6.5.6,6.7.3,7.19,7.20.1.1; GCC13.1 manual section6.46 Volatiles.
N1570 is a public draft, not a claim to the purchased final ISO publication.
https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf
https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Volatiles.html

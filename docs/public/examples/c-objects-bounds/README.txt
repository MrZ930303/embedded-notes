C objects and bounds: original portable host-C11 teaching lab

objects.c contains the complete reusable read_le16 module. Define OBJECTS_TEST
to include its test entry point; without that macro it has no main function.
No third-party vendor ownership or open-source licence is asserted here.

Interface:
  bool read_le16(const uint8_t *input, size_t length,
                 size_t offset, uint16_t *output);

Requires CHAR_BIT == 8 and exact-width uint8_t/uint16_t; unsupported targets
are rejected during compilation. length is a truthful readable byte count from
a real, live input array. A shorter accessible prefix is allowed. output is a
distinct live writable, correctly aligned uint16_t object outside input storage.
Pointers, lifetime, input ownership and truthful extent are caller preconditions;
this function cannot detect dangling/forged pointers or a dishonest length.
Input bytes must remain stable during the call; this is no concurrency protocol.

Returns true and writes the decoded little-endian value only when two bytes fit.
Returns false for null arguments, offset > length, or fewer than two remaining
bytes. Failure performs no input read and preserves the caller's output value.
Zero length is empty and always fails: it does not authorize null + 0 arithmetic.
Bounds are checked before subtraction/indexing; offset + 2 is never used as a
guard. Byte assembly avoids an unaligned wider-type cast and host-endian reliance.

Use an existing C11 compiler. In this repository, route compilation through the
mcu-build custom-profile workflow (validate, dry-run, build); do not bypass the
configured compiler workflow. The compiler command for each profile is:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -DOBJECTS_TEST objects.c -o objects-test
  cc -std=c11 -Wall -Wextra -Werror -pedantic -DOBJECTS_TEST -DNDEBUG objects.c -o objects-ndebug
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c objects.c -o objects.o
Execute both test programs (on Windows use the produced .exe names).
Nonzero exit means failure; checks use if/return and remain active with NDEBUG.
Diagnostic fprintf failures still return failure. A failed success-message puts
also returns a nonzero exit status. After puts succeeds, fflush(stdout) is checked
so buffered output failure also returns nonzero. No output API result is discarded.

Independent success fixtures: 34 12 -> 1234; 7E 34 12 FF at offset 1 -> 1234;
the latter at offset 2 -> FF12; 00 FF -> FF00; FF FF -> FFFF (all hexadecimal).
Rejections: zero length, one-byte object, one byte remaining, offset at end,
offset beyond end, SIZE_MAX offset with a truthful two-byte object, null input
with zero and nonzero length, null output. Every available output begins BEEF
and must remain unchanged on rejection. Defined (uint8_t)-1 -> 255 is checked.
No undefined behavior, expired-pointer access or fabricated huge extent is run.

Technical source: WG14 N1570 public Committee Draft, 2011-04-12, especially
6.2.4, 6.3.1.3, 6.5.6, 7.19 and 7.20.1.1. It is not a latest ISO edition claim.
Host-C verification is separate from the JavaScript teaching model.
No firmware flash, target ABI, MCU, ISR, DMA, RTOS or hardware validation.

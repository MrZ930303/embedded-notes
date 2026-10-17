Original portable teaching example: bits.c (embedded-notes unit03)

Requirements: C11 and the optional exact-width uint32_t. The lab models1..8
unsigned bits, not physical STM32 byte-width registers. Intermediates use
unsigned long (at least32 bits), checked shifts and explicit width masks.

Interface:
bits_apply(width,value,mask,op,output): SET/CLEAR/TOGGLE/INVERT.
bits_field(width,value,offset,length,output): offset<width, length1..width-offset.
bits_shift(width,value,count,output): count<width; clip to declared width.
bits_write(width,initial,data,access,output): fictional RW/RO/W1C.
bits_bad_rmw(output): two separate sequential fake-register counterexamples.
All return BITS_OK/BITS_INVALID. Width1..8, value/mask/data within width.
Known enums only. Every failure preserves output. NULL rejected before access.
Non-NULL output must be real, live, writable, correctly typed. The module cannot
validate forged/dangling pointers. Converting negatives to unsigned does not
make them valid inputs; domain checks still apply. No hardware, threads or UB.

Fixtures: A5/0C set AD, clear A1, toggle A9; complement A5->5A; bits6..4->2.
A5 written0C: RW0C, fictional RO A5, W1C A1.
RW trace read0/other2/write1/final1 (intended3).
W1C trace read3/write3/final0/direct-mask1-result2.
Invalid widths/values/fields/counts/enums/NULL reject; initialized output222
proves preservation. Test conditions remain active with NDEBUG.

Equivalent parameters (Windows executables normally add .exe):
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBITS_TEST bits.c -o bits-test
./bits-test
cc -std=c11 -Wall -Wextra -Werror -pedantic -DBITS_TEST -DNDEBUG bits.c -o bits-test-ndebug
./bits-test-ndebug
cc -std=c11 -Wall -Wextra -Werror -pedantic -c bits.c -o bits.o

This project's host compilation uses configured mcu-build custom profiles:
validate, dry-run, build, then run generated artifact. Record compiler version,
source SHA-256, exit statuses, artifact hashes. Missing tools do not mean PASS.
BITS_TEST enables main/test I/O; omit it for a reusable module object.
Success stdout starts 'PASS bits:', exit0; failed expectations return nonzero.
Browser, host-C, target firmware, hardware and publication evidence are separate.

Observed host verification for these source bytes: existing GCC13.1.0, strict
normal and NDEBUG executables both exit0 with PASS bits; module-only build exit0.
All compilations used mcu-build custom profile validate/dry-run/build.
Source SHA-256: 8964ef336bd48bdb5ae0bc520be6433412dc473f5bd2a675be32be3f01167f2b

The success line is explicitly flushed. puts or fflush failure exits nonzero;
a failed test remains nonzero even when its stderr diagnostic cannot be written.

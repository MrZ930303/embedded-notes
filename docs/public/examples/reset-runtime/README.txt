reset-runtime: original embedded-notes fictional image initializer (C11)

Files: runtime_image.h, runtime_image.c, README.txt. Keep the header beside C.
No device, target startup, function-pointer jump, MMIO or hardware is exercised.
Original project teaching code; no third-party authorship or license is implied.

Prerequisite: an already installed host C11 compiler with eight-bit bytes,
uint8_t, uint32_t and size_t. No installation or board is needed by this lab.
From this directory, using your compiler driver in place of cc:

cc --version
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -DRUNTIME_IMAGE_TEST runtime_image.c -o runtime-test
./runtime-test
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -DRUNTIME_IMAGE_TEST -DNDEBUG runtime_image.c -o runtime-ndebug
./runtime-ndebug
cc -std=c11 -Wall -Wextra -Werror -Wconversion -Wshadow -pedantic -c runtime_image.c -o runtime_image.o

Windows: use the installed driver's name, add .exe to executable output names,
and run .\runtime-test.exe / .\runtime-ndebug.exe in PowerShell. Stop immediately
if a compilation or execution fails; do not run an older executable. In a
managed project requiring a build router, put these identical compiler argv
into its existing custom profile and run validate, dry-run, then build for EACH
actual compile/link. Never use a helper to bypass the project build route.

Expected normal and NDEBUG execution: exit0 and
PASS runtime: fixed64-byte image, transactional boundaries and live checks
An expectation or I/O failure exits nonzero. Runtime checks do not use assert.
Local author validation used existing host GCC13.1.0 via mcu-build custom
validate -> dry-run -> build, including normal/NDEBUG runs and module compile.
This is host evidence, not a target reset or physical startup validation.

Independent fixed fixture: actual64-byte Flash and RAM arrays. Labels0x1000
and0x2000 are integers only. Fill RAM with0xA5; little-endian Flash0..7 bytes
are [64,32,0,0,17,16,0,0], decoding SP0x2040 and entry0x1011 -> target0x1010.
Executable extent [0x1010,0x1012) contains one complete minimum2-byte unit;
no instruction decoding/execution is claimed. Flash32..35=[17,34,51,68].
dataSource32, dataDestination8, dataLength4; bssDestination16,bssLength4.
Success: RAM8..11=[17,34,51,68],16..19=[0,0,0,0], all other bytes0xA5.
Report: initialSp8256,entryWord4113,entryTarget4112,copied4,zeroed4,mainReadytrue.

Use independently of tests: include runtime_image.h in a caller, compile
runtime_image.c without RUNTIME_IMAGE_TEST, and link runtime_image.o. Create
four distinct live, initialized, nonoverlapping objects: readable Flash bytes,
RuntimeRequest, writable RAM bytes and writable RuntimeReport. Supply truthful
actual spans. The call reads/writes only request.flashLength/ramLength bytes;
the caller must ensure the underlying storage really covers them. NULL is
rejected, but an arbitrary non-NULL/dangling/forged pointer or a dishonest span
cannot be validated by this function. Never test those by executing invalid C.
Single execution context, no concurrent access or mutation through aliases.

runtime_image_initialize(flash,&request,ram,&report) validates the WHOLE request
before preparing a private64-byte scratch array. It copies data, zeros BSS,
then commits RAM and named report fields only on RUNTIME_OK. On every rejected
call, all actual accepted RAM bytes and all report fields remain unchanged.
Check status immediately; an unchanged old mainReadytrue is an OLD accepted
report after failure, not evidence that the rejected request succeeded.

Lengths: Flash8..64, RAM1..64. Labels and exclusive endpoints fit uint32_t;
offsets/lengths fit size_t. SP interval includes both RAM boundary endpoints
and requires8-byte alignment, both explicit teaching policies. Empty stack
space at the bottom endpoint is not proof of a usable real call stack.
Entry bit0 must be1; cleared target must have two complete bytes inside the
declared executable interval, itself inside Flash. Entry at end is rejected.
Data source/destination and BSS destination must fit, with no nonempty target
overlap. Check offset+length overflow before arithmetic. Empty data/BSS still
require offset<=object length; an exact endpoint is legal only for zero bytes.
Loops do no pointer formation for those empty regions. Both-empty is allowed.

Statuses: RUNTIME_INVALID_ARGUMENT(NULL), RUNTIME_BAD_LENGTH(capacity policy),
RUNTIME_ADDRESS_OVERFLOW(endpoint or size addition), RUNTIME_BAD_VECTOR(<8),
RUNTIME_BAD_SP(range/alignment), RUNTIME_BAD_ENTRY(Thumb/extent),
RUNTIME_BAD_RANGE(region), RUNTIME_OVERLAP(destinations), RUNTIME_OK(commit).
Fault precedence follows the source, not a promise to list every defect.

Tests use initialized real storage for NULL positions, missing Thumb, entry
before/at end/incomplete extent, SP outside/misaligned, short vector/regions,
label and SIZE_MAX arithmetic, overlap, empty endpoints and nonempty exact ends.
They compare bytes and meaningful report fields, never structure padding.
Main-ready is only this model's completed transaction. Linker placement, actual
core reset, chosen startup/runtime/library contract, boot remapping and a
bootloader's controlled transfer require separate target-specific evidence.

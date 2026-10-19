Unit12: original bounded host transaction, not a hardware driver

Download bus.c, bus.h and this README.txt from this chapter. Also download the
unchanged Unit10 timer-pwm/time.c and time.h. Put all five files in one folder.
Use an already installed C11 compiler; do not install or update a toolchain just
for this example. bus.c and time.c are separate translation units, with no main
unless time.c is explicitly compiled with TIME_TEST (not used below).

Example consumer.c:
  #include "bus.h"
  #include "bus.h"
  #include <stdio.h>
  int main(void) {
      BusState state;
      BusRequest request = {BUS_I2C, 0x18U, 0x0FU};
      BusEvent event = {BUS_EVENT_OK, 0x33U};
      BusReport report;
      unsigned int tick;
      if (bus_init(&state) != BUS_OK ||
          bus_start(&state, &request, 0U) != BUS_OK) { return 1; }
      for (tick = 0U; tick < 9U; tick++) {
          if (bus_poll(&state, tick, &event, &report) != BUS_OK) { return 2; }
      }
      if (!report.newResult || report.result != 0x33U) { return 3; }
      return puts("READY 33 at tick8") < 0 ? 4 : 0;
  }

Conventional commands for a human using an existing compiler:
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c bus.c -o bus.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c time.c -o time.o
  cc -std=c11 -Wall -Wextra -Werror -pedantic -c consumer.c -o consumer.o
  cc bus.o time.o consumer.o -o consumer
  ./consumer
Repeat with -DNDEBUG on each compile. Checks use returned statuses, not assert.
On Windows the executable may be consumer.exe. A nonzero build must stop this
sequence: never run an older executable as evidence of a failed build.

AgentHub actual compile/preprocess/assemble/link actions must instead use the
mcu-build build_router.py custom profile: validate -> build --dry-run -> build.
Set command to the exact argument array for each action above, artifacts to the
relative expected object/executable path, artifact_policy="all". Retain raw
compiler status, diagnostics, profile/tool/input/header hashes and fresh output
hashes. The repository test supports that routed path:
  node scripts/test-bus-transactions.mjs --c --compiler <existing-cc>
       --python <existing-python> --router <build_router.py>
       --output .scratch/protocol-acquisition/reproduction

Frozen public contract
  bus_init: genuinely fresh storage only, no old member read. Never erase a live
  operation or UNKNOWN state by initialization, copying or reset. No reset API.
  bus_start: initialized state and disjoint real request; copy three fields,
  retain no caller payload pointer; no backend action. Only I2C/SPI address7=18,
  register=0F are this LIS3DH fixture. Numeric 30 remains a valid generic 7-bit
  address but is a target mismatch here; no guessing or automatic unshift.
  PENDING/OWNED/UNKNOWN admission returns BUS_BUSY, preserving every named field.
  RELEASED/LOST terminal state may admit an explicit new operation; it checks new
  time and starts again at WAIT_FREE (I2C) or SELECT (SPI). LOST says the local
  controller lost ownership, not that real lines are now free. UNKNOWN refuses
  reuse; external confirmed recovery needs a later separate contract.

  bus_poll: at most one logical phase, no queue, callback, heap, loop or retry.
  I2C nine phases: WAIT_FREE START ADDRESS_WRITE SUBADDRESS RESTART ADDRESS_READ
  DATA FINAL_NACK STOP. OK at ticks0..8 commits33 only at8. START gains ownership;
  repeated START retains it. Address30/SUB0F/read31 are reported transmitted.
  Receiver final NACK is an ordinary phase, not a BUS_EVENT_NACK error.
  SPI four phases: SELECT COMMAND SPI_DATA DESELECT. COMMAND sends8F and discards
  received7E. SPI_DATA sends dummy00, receiving33; candidate commits on DESELECT.
  CS stays selected through both frames. Any byte may complete; identityMatches
  separately compares committed data with33. No physical presence/health proof.

  Supplied WAIT makes no action; repeated calls return immediately. A NACK event
  is valid only at I2C address or SUB, retaining ADDRESS_NACK/DATA_NACK plus its
  failurePhase and moving to ERROR_STOP while OWNED. A later OK executes one
  logical STOP and becomes FAILED/RELEASED without committing. ARLO is valid only
  on owned I2C: FAILED/LOST immediately, no STOP. ERROR/STUCK terminate UNKNOWN.
  A second cleanup fault retains the initiating cause/phase. Invalid event kind
  or phase rejects without changes; reports are unchanged on all rejected calls.

  Twenty milliseconds cover the entire accepted operation, not each phase.
  Equality expires before another phase or accepting newly supplied data. No
  STOP is issued by the timeout branch. policyCause=TIMEOUT; initiating cause
  and failurePhase survive if a NACK had already occurred. Otherwise cause is
  TIMEOUT and failurePhase is the detected phase. Resource becomes UNKNOWN even
  when WAIT_FREE never acquired ownership: physical availability is unresolved.
  elapsed saturates at20; no growing trace or diagnostic counter exists.

  One tick=1ms. Uses the unchanged time_elapsed checked unsigned32 contract.
  Caller promises true forward inter-observation gaps <2^31 ticks. Observed
  delta>=2^31 rejects before state/report mutation; equal samples are valid.
  Unseen whole wraps, stopped time and absent scheduling cannot be detected or
  repaired by a deadline number. start after a terminal also checks observation.

  phase reports the executed/detected phase; nextPhase is resulting state.
  cause/failurePhase identify initiating fault; policyCause names deadline policy.
  action is zero or one; WAIT/deadline/terminal calls have zero. resultPresent
  may describe an old result. ONLY newResult authorizes a fresh value. PENDING,
  admission/time rejection and every failure preserve the last committed result.
  Terminal poll has no action or state advance, and newResult is false.

  Resource limits: one copied request, one candidate byte, one committed byte,
  one supplied event and one report per call; no event retention/history capacity
  to exhaust. Finite browser fixtures have at most9 rows and stop at their end.
  No recursion, sleep, retry, cancel or physical recovery. Exclusive single
  context, non-reentrant; objects live for the call, state for the operation.
  All pointers must name live correctly typed sufficiently sized objects. State,
  request/event and output do not overlap. Null/selected metadata checks cannot
  prove pointer validity, extents, concurrency or arbitrary corruption safety.

Original diagrams/replays and software policy are teaching choices. No actual
I2C/SPI/HAL/MMIO access, GPIO bus clear, target timing/electrical qualification,
hardware identity/measurement or worst-case target stack is established. Current
official RM0090 and some sensor/errata table pixels remain unread as described
in the chapter. Host .su and heuristic checks are qualified local evidence only.

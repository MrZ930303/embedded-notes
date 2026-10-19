/******************************************************************************
 * Original embedded-notes teaching code, 2026. No third-party ownership claimed.
 * @file terminal.c
 * @author embedded-notes contributors
 * @brief Closed bounded host recovery; no hardware operation.
 * @version V1.0 2026-10-17
 *****************************************************************************/
#include "terminal.h"
#include "fake_sensor.h"

/**
 * @brief valid config: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_config(const RecoveryConfig *config)
{
    /** Respect the finite domain before dispatch or state publication. **/
    return config != NULL && config->backend >= RECOVERY_BACKEND_FAKE &&
        config->backend <= RECOVERY_BACKEND_ADC && config->firstToken != 0U &&
        config->fakeRegister <= RECOVERY_FAKE_MAX_VALUE && config->fakeCounter <= RECOVERY_FAKE_MAX_VALUE &&
        (config->backend != RECOVERY_BACKEND_ADC || (config->fakeRegister == 0U && config->fakeCounter == 0U));
}
/**
 * @brief valid input: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
static bool valid_input(RecoveryBackendKind kind, RecoveryOperation operation, const RecoveryInput *input)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (input == NULL || input->kind < RECOVERY_INPUT_NONE || input->kind > RECOVERY_INPUT_ADC_ADVANCE) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_NONE) {
        return input->token == 0U && input->cause == RECOVERY_CAUSE_NONE;
    }
    if (input->token == 0U) {
        return false;
    }
    if (input->kind == RECOVERY_INPUT_FAIL) {
        return kind == RECOVERY_BACKEND_ADC ? input->cause == RECOVERY_CAUSE_ADC_BACKEND :
            (input->cause >= RECOVERY_CAUSE_NACK && input->cause <= RECOVERY_CAUSE_LOST_REPLY);
    }
    if (input->cause != RECOVERY_CAUSE_NONE) {
        return false;
    }
    if (kind == RECOVERY_BACKEND_ADC) {
        return input->kind == RECOVERY_INPUT_WAIT || input->kind == RECOVERY_INPUT_ADC_ADVANCE;
    }
    return input->kind != RECOVERY_INPUT_ADC_ADVANCE &&
        (input->kind != RECOVERY_INPUT_COMMIT_LOST_REPLY ||
            operation == RECOVERY_ASSIGN || operation == RECOVERY_INCREMENT);
}
/**
 * @brief recovery terminal init: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_terminal_init(RecoveryTerminal *terminal, const RecoveryConfig *config,
    uint16_t initialPeriod, uint32_t now)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryTerminal next = {0};
    RecoveryCall call;
    if (terminal == NULL || initialPeriod == 0U || initialPeriod > 1000U || !valid_config(config)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    call = recovery_init(&next.job, config, now);
    if (call != RECOVERY_OK) {
        return call;
    }
    if (uart_init(&next.uart, initialPeriod, now) != UART_OK) {
        return RECOVERY_BAD_STATE;
    }
    *terminal = next;
    return RECOVERY_OK;
}
/**
 * @brief recovery terminal receive: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
UartStatus recovery_terminal_receive(RecoveryTerminal *terminal, uint16_t byte, UartIngress *report)
{
    /** Respect the finite domain before dispatch or state publication. **/
    if (terminal == NULL) {
        return UART_INVALID_ARGUMENT;
    }
    return uart_receive(&terminal->uart, byte, report);
}
/**
 * @brief recovery terminal turn: bounded checked host operation.
 * @param[in,out] Named real disjoint call objects under the public contract.
 * @return Typed outcome; no blocking work.
 */
RecoveryCall recovery_terminal_turn(RecoveryTerminal *terminal, uint32_t now,
    const RecoveryInput *input, RecoveryTurnReport *report, RecoveryValue *result,
    RecoveryStatusResponse *response)
{
    /** Respect the finite domain before dispatch or state publication. **/
    RecoveryTurnReport next = {0};
    RecoverySnapshot snapshot;
    UartCommand command;
    if (terminal == NULL || report == NULL || result == NULL || response == NULL || input == NULL) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    if (!valid_input(terminal->job.backend.kind, terminal->job.request.operation, input)) {
        return RECOVERY_INVALID_ARGUMENT;
    }
    next.uartStatus = uart_poll(&terminal->uart, now, &next.uart, &command);
    next.uartReportValid = next.uartStatus == UART_OK;
    next.jobStatus = recovery_service(&terminal->job, now, input, &next.job, result);
    next.jobReportValid = next.jobStatus == RECOVERY_OK;
    if (next.uartReportValid && next.uart.commandPresent && command.kind == UART_GET_STATUS &&
        recovery_status(&terminal->job, &snapshot) == RECOVERY_OK) {
        *response = (RecoveryStatusResponse){command.periodMs,snapshot};
        next.responsePresent = true;
    }
    *report = next;
    return RECOVERY_OK;
}

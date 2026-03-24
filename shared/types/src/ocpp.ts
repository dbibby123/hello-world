/**
 * OCPP 2.0.1 / 2.1 Core Type Definitions
 * Based on Open Charge Alliance OCPP 2.0.1 specification
 */

// ─── OCPP Message Frame ────────────────────────────────────────────────────

export type OcppMessageTypeId = 2 | 3 | 4; // CALL | CALLRESULT | CALLERROR

export type OcppCall = [
  messageTypeId: 2,
  messageId: string,
  action: string,
  payload: Record<string, unknown>
];

export type OcppCallResult = [
  messageTypeId: 3,
  messageId: string,
  payload: Record<string, unknown>
];

export type OcppCallError = [
  messageTypeId: 4,
  messageId: string,
  errorCode: OcppErrorCode,
  errorDescription: string,
  errorDetails: Record<string, unknown>
];

export type OcppMessage = OcppCall | OcppCallResult | OcppCallError;

export type OcppErrorCode =
  | 'NotImplemented'
  | 'NotSupported'
  | 'InternalError'
  | 'ProtocolError'
  | 'SecurityError'
  | 'FormationViolation'
  | 'PropertyConstraintViolation'
  | 'OccurrenceConstraintViolation'
  | 'TypeConstraintViolation'
  | 'GenericError';

// ─── Device Model (OCPP 2.x Hierarchy) ────────────────────────────────────

export interface ChargingStationInfo {
  stationId: string;               // Unique identifier (maps to WebSocket path)
  model: string;
  vendorName: string;
  firmwareVersion?: string;
  serialNumber?: string;
  modem?: { iccid?: string; imsi?: string };
  ocppVersion: '2.0.1' | '2.1';
}

export interface EVSE {
  id: number;                      // 1-based per station
  connectors: Connector[];
}

export interface Connector {
  id: number;                      // 1-based per EVSE
  type: ConnectorType;
  status: ConnectorStatus;
}

export type ConnectorType =
  | 'cCCS1' | 'cCCS2' | 'cG105' | 'cTesla' | 'cType1' | 'cType2'
  | 'sType2' | 'sType3' | 'Other1PhMax16A' | 'Other1PhOver16A'
  | 'Other3Ph' | 'Pan' | 'Undetermined' | 'Unknown' | 'Wireless';

export type ConnectorStatus =
  | 'Available' | 'Occupied' | 'Reserved' | 'Unavailable' | 'Faulted';

// ─── Boot Notification ─────────────────────────────────────────────────────

export interface BootNotificationRequest {
  chargingStation: {
    model: string;
    vendorName: string;
    firmwareVersion?: string;
    serialNumber?: string;
    modem?: { iccid?: string; imsi?: string };
  };
  reason: BootReasonEnumType;
}

export type BootReasonEnumType =
  | 'ApplicationReset' | 'FirmwareUpdate' | 'LocalReset' | 'PowerUp'
  | 'RemoteReset' | 'ScheduledReset' | 'Triggered' | 'Unknown' | 'Watchdog';

export interface BootNotificationResponse {
  currentTime: string;             // ISO 8601
  interval: number;                // Heartbeat interval in seconds
  status: RegistrationStatus;
}

export type RegistrationStatus = 'Accepted' | 'Pending' | 'Rejected';

// ─── Heartbeat ─────────────────────────────────────────────────────────────

export type HeartbeatRequest = Record<string, never>;

export interface HeartbeatResponse {
  currentTime: string;
}

// ─── Status Notification ───────────────────────────────────────────────────

export interface StatusNotificationRequest {
  timestamp: string;
  connectorStatus: ConnectorStatus;
  evseId: number;
  connectorId: number;
}

export type StatusNotificationResponse = Record<string, never>;

// ─── Authorization ─────────────────────────────────────────────────────────

export interface AuthorizeRequest {
  idToken: IdTokenType;
  certificate?: string;
  iso15118CertificateHashData?: OCSPRequestDataType[];
}

export interface IdTokenType {
  idToken: string;
  type: IdTokenEnumType;
  additionalInfo?: AdditionalInfoType[];
}

export type IdTokenEnumType =
  | 'Central' | 'eMAID' | 'ISO14443' | 'ISO15693' | 'KeyCode'
  | 'Local' | 'MacAddress' | 'NoAuthorization';

export interface AdditionalInfoType {
  additionalIdToken: string;
  type: string;
}

export interface OCSPRequestDataType {
  hashAlgorithm: 'SHA256' | 'SHA384' | 'SHA512';
  issuerNameHash: string;
  issuerKeyHash: string;
  serialNumber: string;
  responderURL: string;
}

export interface AuthorizeResponse {
  idTokenInfo: IdTokenInfoType;
  certificateStatus?: AuthorizeCertificateStatusEnumType;
}

export interface IdTokenInfoType {
  status: AuthorizationStatus;
  cacheExpiryDateTime?: string;
  chargingPriority?: number;
  language1?: string;
  evseId?: number[];
  groupIdToken?: IdTokenType;
  language2?: string;
  personalMessage?: MessageContentType;
}

export type AuthorizationStatus =
  | 'Accepted' | 'Blocked' | 'ConcurrentTx' | 'Expired'
  | 'Invalid' | 'NoCredit' | 'NotAllowedTypeEVSE' | 'NotAtThisLocation'
  | 'NotAtThisTime' | 'Unknown';

export type AuthorizeCertificateStatusEnumType =
  | 'Accepted' | 'SignatureError' | 'CertificateExpired'
  | 'CertificateRevoked' | 'NoCertificateAvailable' | 'CertChainError'
  | 'ContractCancelled';

export interface MessageContentType {
  format: 'ASCII' | 'HTML' | 'URI' | 'UTF8';
  language?: string;
  content: string;
}

// ─── Transaction Events ────────────────────────────────────────────────────

export interface TransactionEventRequest {
  eventType: TransactionEventEnumType;
  timestamp: string;
  triggerReason: TriggerReasonEnumType;
  seqNo: number;                   // Sequence number for ordering
  transactionInfo: TransactionType;
  offline?: boolean;
  numberOfPhasesUsed?: number;
  cableMaxCurrent?: number;
  reservationId?: number;
  evse?: EVSEType;
  idToken?: IdTokenType;
  meterValue?: MeterValueType[];
}

export type TransactionEventEnumType = 'Started' | 'Updated' | 'Ended';

export type TriggerReasonEnumType =
  | 'Authorized' | 'CablePluggedIn' | 'ChargingRateChanged' | 'ChargingStateChanged'
  | 'Deauthorized' | 'EnergyLimitReached' | 'EVCommunicationLost' | 'EVConnectTimeout'
  | 'MeterValueClock' | 'MeterValuePeriodic' | 'TimeLimitReached' | 'Trigger'
  | 'UnlockCommand' | 'StopAuthorized' | 'EVDeparted' | 'EVDetected'
  | 'RemoteStop' | 'RemoteStart' | 'AbnormalCondition' | 'SignedDataReceived'
  | 'ResetCommand';

export interface TransactionType {
  transactionId: string;
  chargingState?: ChargingStateEnumType;
  timeSpentCharging?: number;
  stoppedReason?: ReasonEnumType;
  remoteStartId?: number;
}

export type ChargingStateEnumType =
  | 'Charging' | 'EVConnected' | 'SuspendedEV' | 'SuspendedEVSE' | 'Idle';

export type ReasonEnumType =
  | 'DeAuthorized' | 'EmergencyStop' | 'EnergyLimitReached' | 'EVDisconnected'
  | 'GroundFault' | 'ImmediateReset' | 'Local' | 'LocalOutOfCredit' | 'MasterPass'
  | 'Other' | 'OvercurrentFault' | 'PowerLoss' | 'PowerQuality' | 'Reboot'
  | 'Remote' | 'SOCLimitReached' | 'StoppedByEV' | 'TimeLimitReached'
  | 'Timeout';

export interface EVSEType {
  id: number;
  connectorId?: number;
}

// ─── Meter Values ──────────────────────────────────────────────────────────

export interface MeterValueType {
  timestamp: string;
  sampledValue: SampledValueType[];
}

export interface SampledValueType {
  value: number;
  context?: ReadingContextEnumType;
  measurand?: MeasurandEnumType;
  phase?: PhaseEnumType;
  location?: LocationEnumType;
  unitOfMeasure?: UnitOfMeasureType;
}

export type ReadingContextEnumType =
  | 'Interruption.Begin' | 'Interruption.End' | 'Other' | 'Sample.Clock'
  | 'Sample.Periodic' | 'Transaction.Begin' | 'Transaction.End' | 'Trigger';

export type MeasurandEnumType =
  | 'Current.Export' | 'Current.Import' | 'Current.Offered'
  | 'Energy.Active.Export.Register' | 'Energy.Active.Import.Register'
  | 'Energy.Reactive.Export.Register' | 'Energy.Reactive.Import.Register'
  | 'Energy.Active.Export.Interval' | 'Energy.Active.Import.Interval'
  | 'Energy.Reactive.Export.Interval' | 'Energy.Reactive.Import.Interval'
  | 'Frequency' | 'Power.Active.Export' | 'Power.Active.Import'
  | 'Power.Factor' | 'Power.Offered' | 'Power.Reactive.Export'
  | 'Power.Reactive.Import' | 'SoC' | 'Voltage';

export type PhaseEnumType =
  | 'L1' | 'L2' | 'L3' | 'N' | 'L1-N' | 'L2-N' | 'L3-N' | 'L1-L2' | 'L2-L3' | 'L3-L1';

export type LocationEnumType = 'Body' | 'Cable' | 'EV' | 'Inlet' | 'Outlet';

export interface UnitOfMeasureType {
  unit?: string;
  multiplier?: number;
}

export interface TransactionEventResponse {
  totalCost?: number;
  chargingPriority?: number;
  idTokenInfo?: IdTokenInfoType;
  updatedPersonalMessage?: MessageContentType;
}

// ─── Smart Charging ────────────────────────────────────────────────────────

export interface ChargingProfileType {
  id: number;
  stackLevel: number;
  chargingProfilePurpose: ChargingProfilePurposeEnumType;
  chargingProfileKind: ChargingProfileKindEnumType;
  recurrencyKind?: RecurrencyKindEnumType;
  validFrom?: string;
  validTo?: string;
  transactionId?: string;
  chargingSchedule: ChargingScheduleType[];
}

export type ChargingProfilePurposeEnumType =
  | 'ChargingStationExternalConstraints' | 'ChargingStationMaxProfile'
  | 'TxDefaultProfile' | 'TxProfile';

export type ChargingProfileKindEnumType = 'Absolute' | 'Recurring' | 'Relative';

export type RecurrencyKindEnumType = 'Daily' | 'Weekly';

export interface ChargingScheduleType {
  id: number;
  startSchedule?: string;
  duration?: number;
  chargingRateUnit: ChargingRateUnitEnumType;
  minChargingRate?: number;
  chargingSchedulePeriod: ChargingSchedulePeriodType[];
  salesTariff?: SalesTariffType;
}

export type ChargingRateUnitEnumType = 'A' | 'W';

export interface ChargingSchedulePeriodType {
  startPeriod: number;             // Seconds from startSchedule
  limit: number;                   // Max charge rate
  numberPhases?: number;
  phaseToUse?: number;
}

export interface SalesTariffType {
  id: number;
  salesTariffDescription?: string;
  numEPriceLevels?: number;
  salesTariffEntry: SalesTariffEntryType[];
}

export interface SalesTariffEntryType {
  relativeTimeInterval: RelativeTimeIntervalType;
  ePriceLevel?: number;
  consumptionCost?: ConsumptionCostType[];
}

export interface RelativeTimeIntervalType {
  start: number;
  duration?: number;
}

export interface ConsumptionCostType {
  startValue: number;
  cost: CostType[];
}

export interface CostType {
  costKind: CostKindEnumType;
  amount: number;
  amountMultiplier?: number;
}

export type CostKindEnumType =
  | 'CarbonDioxideEmission' | 'RelativePricePercentage' | 'RenewableGenerationPercentage';

// ─── Remote Commands ───────────────────────────────────────────────────────

export interface RequestStartTransactionRequest {
  evseId?: number;
  remoteStartId: number;
  idToken: IdTokenType;
  chargingProfile?: ChargingProfileType;
  groupIdToken?: IdTokenType;
}

export interface RequestStartTransactionResponse {
  status: RequestStartStopStatusEnumType;
  statusInfo?: StatusInfoType;
  transactionId?: string;
}

export interface RequestStopTransactionRequest {
  transactionId: string;
}

export interface RequestStopTransactionResponse {
  status: RequestStartStopStatusEnumType;
  statusInfo?: StatusInfoType;
}

export type RequestStartStopStatusEnumType = 'Accepted' | 'Rejected';

export interface StatusInfoType {
  reasonCode: string;
  additionalInfo?: string;
}

// ─── Firmware Management ───────────────────────────────────────────────────

export interface UpdateFirmwareRequest {
  retries?: number;
  retryInterval?: number;
  requestId: number;
  firmware: FirmwareType;
}

export interface FirmwareType {
  location: string;                // URL of firmware file
  retrieveDateTime: string;
  installDateTime?: string;
  signingCertificate?: string;
  signature?: string;
}

export type UpdateFirmwareResponse = {
  status: UpdateFirmwareStatusEnumType;
  statusInfo?: StatusInfoType;
};

export type UpdateFirmwareStatusEnumType =
  | 'Accepted' | 'Rejected' | 'AcceptedCanceled' | 'InvalidCertificate' | 'RevokedCertificate';

// ─── Variables (Device Configuration) ─────────────────────────────────────

export interface GetVariablesRequest {
  getVariableData: GetVariableDataType[];
}

export interface GetVariableDataType {
  attributeType?: AttributeEnumType;
  component: ComponentType;
  variable: VariableType;
}

export interface SetVariablesRequest {
  setVariableData: SetVariableDataType[];
}

export interface SetVariableDataType {
  attributeType?: AttributeEnumType;
  attributeValue: string;
  component: ComponentType;
  variable: VariableType;
}

export interface ComponentType {
  name: string;
  instance?: string;
  evse?: EVSEType;
}

export interface VariableType {
  name: string;
  instance?: string;
}

export type AttributeEnumType = 'Actual' | 'Target' | 'MinSet' | 'MaxSet';

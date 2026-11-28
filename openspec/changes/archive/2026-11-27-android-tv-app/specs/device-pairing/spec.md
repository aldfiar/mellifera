# Spec Delta

## ADDED Requirements

### Requirement: Device debug flag
Every paired device SHALL carry an additive debug flag (default false) stored on the device credential row: the admin flips it via PUT /admin/devices/{id}/debug (200; unknown device 404), the paired-device registry listing exposes it per device, and the device-kind profile answer carries it so the paired client can gate its debug telemetry on it.

#### Scenario: Admin flips a device's debug flag
- **WHEN** the admin PUTs {"debug": true} to /admin/devices/{id}
- **THEN** the device registry lists debug true for that device and its GET /profile answer carries debug true

#### Scenario: Unknown device refuses
- **WHEN** the admin PUTs to a non-existent device id
- **THEN** the answer is 404 and no row changes

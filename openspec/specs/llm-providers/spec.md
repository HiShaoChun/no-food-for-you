# llm-providers

## Requirements

### Requirement: Provider Registry
The system SHALL maintain a static registry of LLM providers, each mapping to an `.env` key name and an `.env` base URL name.

#### Scenario: Registry exposes 5 providers
- **WHEN** the application loads
- **THEN** `PROVIDERS` SHALL contain entries for `ark`, `minimax`, `zhipu`, `deepseek`, `moonshot`
- **AND** each entry SHALL specify the env var name for its API key and base URL

### Requirement: Model Registry
The system SHALL maintain a static registry mapping user-facing model keys to a (provider, modelId) pair.

#### Scenario: MVP registry contains 5 models all routed to ark
- **WHEN** the application loads
- **THEN** `MODELS` SHALL contain exactly these 5 keys: `doubao-seed-code`, `minimax-m2.7`, `glm-5.1`, `deepseek-v4-pro`, `kimi-k2.6`
- **AND** each model's `provider` SHALL be `ark` (MVP routes all 5 through the Ark gateway)
- **AND** each model's `modelId` SHALL equal its display key

### Requirement: Environment-based Configuration
The system SHALL read provider API keys and base URLs exclusively from environment variables. No API key SHALL ever be transmitted to the browser or persisted outside `.env`.

#### Scenario: Key present in .env
- **WHEN** `ARK_API_KEY` and `ARK_BASE_URL` are set in `.env`
- **THEN** `getClient("ark")` SHALL return an `OpenAI` SDK instance configured with those values

#### Scenario: Key missing
- **WHEN** `getClient("ark")` is called and `ARK_API_KEY` is empty or unset
- **THEN** the function SHALL throw an error containing the missing env var name
- **AND** the error SHALL NOT leak any partial key fragment

### Requirement: Provider Availability Probe
The system SHALL expose an `availability` function that returns which providers have both their API key and base URL configured.

#### Scenario: Probe at startup
- **WHEN** `getAvailability()` is invoked
- **THEN** it SHALL return a `Record<provider, boolean>` where `true` means both `envKey` and `envUrl` are non-empty in `process.env`
- **AND** the result SHALL be safe to expose to the frontend (no key material included)

#### Scenario: Frontend uses probe to gray out disabled models
- **WHEN** the UI renders the model picker
- **AND** `availability.ark === false`
- **THEN** all models whose `provider === "ark"` SHALL appear disabled with a tooltip "请在 .env 配置 ARK_API_KEY 与 ARK_BASE_URL"

### Requirement: OpenAI-compatible Protocol Only
The system SHALL invoke all LLM providers exclusively through the OpenAI-compatible chat completions protocol.

#### Scenario: Single SDK across providers
- **WHEN** `getClient(provider)` is invoked for any registered provider
- **THEN** the returned object SHALL be an instance of the `openai` npm package's `OpenAI` class
- **AND** no provider-specific adapter code SHALL exist in `lib/llm/`

"""ABI definitions for on-chain compliance contracts.

Minimal ABIs for ModularCompliance, CountryAllowModule,
and MaxHolderCountModule.
"""

MODULAR_COMPLIANCE_ABI = [
    {
        "inputs": [],
        "name": "getModules",
        "outputs": [{"name": "", "type": "address[]"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "module", "type": "address"}],
        "name": "isModuleBound",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "module", "type": "address"}],
        "name": "addModule",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "module", "type": "address"}],
        "name": "removeModule",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "getTokenBound",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "callData", "type": "bytes"},
            {"name": "module", "type": "address"},
        ],
        "name": "callModuleFunction",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "selector", "type": "bytes4"},
            {"name": "allowed", "type": "bool"},
        ],
        "name": "setAllowedSelector",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

COMPLIANCE_MODULE_ABI = [
    {
        "inputs": [],
        "name": "name",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "compliance", "type": "address"}],
        "name": "isComplianceBound",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "compliance", "type": "address"}],
        "name": "bindCompliance",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "compliance", "type": "address"}],
        "name": "unbindCompliance",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

COUNTRY_ALLOW_MODULE_ABI = [
    *COMPLIANCE_MODULE_ABI,
    {
        "inputs": [
            {"name": "compliance", "type": "address"},
            {"name": "country", "type": "uint16"},
        ],
        "name": "addAllowedCountry",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "compliance", "type": "address"},
            {"name": "country", "type": "uint16"},
        ],
        "name": "removeAllowedCountry",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "compliance", "type": "address"},
            {"name": "countries", "type": "uint16[]"},
        ],
        "name": "batchAllowCountries",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"name": "compliance", "type": "address"},
            {"name": "country", "type": "uint16"},
        ],
        "name": "isCountryAllowed",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    },
]

MAX_HOLDER_COUNT_MODULE_ABI = [
    *COMPLIANCE_MODULE_ABI,
    {
        "inputs": [
            {"name": "compliance", "type": "address"},
            {"name": "maxCount", "type": "uint256"},
        ],
        "name": "setMaxHolderCount",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"name": "compliance", "type": "address"}],
        "name": "getMaxHolderCount",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"name": "compliance", "type": "address"}],
        "name": "getHolderCount",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

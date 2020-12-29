

help: ## Displays help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-z0-9A-Z_-]+:.*?##/ { printf "  \033[36m%-17s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)


.PHONY: slither
slither: ## Run slither security checks.
	slither . --filter-paths "node_modules/@openzeppelin/contracts/GSN/Context.sol" --exclude naming-convention,solc-version,pragma,external-function
.PHONY: solhint
solhint: ## Run solhint linter.
	solhint 'contracts/**/*.sol'

deploy-testnet: ## Deploy on the testnet.
	npx hardhat deploy --network rinkeby \
    --tellor-address 0xfe41cb708cd98c5b20423433309e55b53f79134a\
    --collateral-address 0xc778417e063141139fce010982780140aa0cd5ab\
    --collateral-id 1\
    --collateral-granularity 1000000 \
    --collateral-name Etherium \
    --collateral-symbol ETH \
    --token-name TOKEN \
    --token-symbol TKN \
    --infl-rate-per-year 500000000000000000 \
    --benificiary-address 0x0e93f23278161bCa6F22D6268ca44691042ed437

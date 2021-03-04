

help: ## Displays help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-z0-9A-Z_-]+:.*?##/ { printf "  \033[36m%-17s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)


.PHONY: slither
slither: ## Run slither security checks.
	slither . --filter-paths "node_modules/*" --exclude naming-convention,solc-version,pragma,external-function
.PHONY: solhint
solhint: ## Run solhint linter.
	solhint 'contracts/**/*.sol'

deploy-testnet: ## Deploy on the testnet.
	export $(cat .env | xargs) && \
	npx hardhat deploy --network rinkeby \
    --tellor-address 0xfe41cb708cd98c5b20423433309e55b53f79134a\
    --collateral-address ${COLLATERAL_ADDRESS}\
    --collateral-id ${COLLATERAL_ID}\
    --collateral-granularity ${COLLATERAL_GRANULARITY}\
    --collateral-name ${COLLATERAL_NAME}\
    --collateral-symbol ${COLLATERAL_SYMBOL}\
    --token-name ${TOKEN_NAME}\
    --token-symbol ${TOKEN_SYMBOL}\
    --infl-rate-per-year ${INFL_RATE_PER_YEAR}\
    --benificiary-address ${BENIFICIARY_ADDRESS}

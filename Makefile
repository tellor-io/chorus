

.PHONY: slither
slither:
	slither . --filter-paths "node_modules/@openzeppelin/contracts/GSN/Context.sol" --exclude naming-convention,solc-version,pragma,external-function
.PHONY: solhint
solhint:
	solhint 'contracts/**/*.sol'
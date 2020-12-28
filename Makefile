

PHONY: slither
slither:
	@mkdir -p tmp
	truffle-flattener contracts/Main.sol | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' > ./tmp/flatten.sol
	@[ -s tmp/flatten.sol ] || exit 1
	slither tmp/flatten.sol --exclude naming-convention,solc-version,pragma,external-function

PHONY: solhint
solhint:
	solhint 'contracts/**/*.sol'
# How it works

## Technical Details

Chorus is a composable system, with only 6 components to be set by the creator of a smart contract for generating Notes called an Anthem.

### Variables to set:

**Collateral Pairing:** e.g. "YourToken"/USD

**Collateralization ratio:** e.g. 150%

**Liquidation Threshold:** e.g. 100%

**Withdrawal Delay:** e.g. 1 day

**Inflation rate:** e.g. 10%

I**nflation Beneficiary:** \(address\)

**Owner:** \(address\)

### The flow of the Chorus protocol is as such:

The issuing party \(IP\) deploys an “Anthem” \(smart contract referring to a specific implementation of Chorus\) from the main Chorus deployer. They are then the owner of this Anthem and can set the variables or transfer the ownership to a contract with more decentralized control \(e.g. a DAO\). The owner then locks some amount of their chosen token into their Anthem. Using the Tellor oracle as the pricing mechanism, the token’s value is converted to the price of its collateral pair and the new Notes are issued at a rate set by the issuer. For example, if 1000 TRB \(assuming $20 per TRB\) is collateralized, using a USD pairing, a collateralization ratio of 100%, and issued at a rate of 1 Note per $1.00 USD, then 20,000 Notes would therefore be issued.

{% hint style="success" %}
The Notes can now be used as a currency as the community sees fit.
{% endhint %}

In the case that the value of the collateral drops below 100% \(or the configured collateralization ratio\), any party can liquidate the system. In this case, the Note holders can now access the collateral at the current conversion rate \(e.g. .9 to 1\) once the withdrawal period is over If the owner wants to avoid liquidation, they can place more collateral in the contract.

The conversion ratio for withdrawing notes is set by the price target \(e.g. one n, and then changes based upon the set inflation rate in the contract. Inflation lowers the conversion rate by issuing more Notes to the inflation beneficiary \(IB\) without increasing the underlying collateral amount. In order to prevent parties from trying to game the oracle updates, the withdrawal delay makes parties wait a day before their withdrawal goes through.

### **Collateral**

The flexible nature of Chorus allows the collateral to be any ERC20 supported by the Tellor oracle system. These can be any token, stablecoin, or even asset-backed token. The envisioned use cases are for the creator of an anthem to be an owner or stakeholder in the collateral token, however this does not necessarily have to be the case. Chorus can also be used to add a custom monetary policy to a stablecoin or other asset backed coin to allow for a tailored policy specifically for creating a money for the issuer’s community.

The creator of a sheet also does not have to be just one party. A contract can be set up as the owner which can have tools in place to allow for pooled funds or risk sharing when locking collateral in the anthem.

### **The Oracle and Liquidation**

To determine whether the anthem is sufficiently collateralized, any party can call to update the price based upon the corresponding Tellor oracle. Since values on Tellor can be disputed \(placed on chain and then taken off if a bad value\), all price updates in the Chorus system must be at least an hour old. This hour long period of waiting is for two reasons: a\) to allow for disputes in the Tellor system and b\) to enable the owner to further collateralize the system to avoid liquidations.

Once the system goes to liquidation, any party can withdraw tokens at the current rate of the oracle minus a liquidation penalty. The liquidation penalty is sent to the beneficiary address. In many cases, you may not want a liquidation penalty, but depending on the exact structure \(volatility and nature\) of the collateral token, liquidation could be an extremely disruptive event for the system, so the anthem can be structured to discourage any attempt at manipulation of the oracle or quick liquidations to gain a profit.

{% page-ref page="custom-monetary-policy.md" %}

### \*\*\*\*


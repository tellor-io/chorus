# Custom Monetary Policy

## Inflation

The main differentiator between Chorus and other stablecoin protocols is the flexibility of the monetary policy that the system allows. The key feature of the entire system is the targeted inflation rate which reduces the amount of collateral that each Note can be exchanged for. The base inflation rate is set by the owner \(e.g. 10%\) and then every time collateralization is calculated or new tokens are issued, the new exchange rate is taken into account. New Notes are issued on a continuous basis to the inflation beneficiary address \(which they can claim in the contract\).

To give an example, party A \(the owner\) locks 150 collateral tokens worth 1$ each in a new anthem with a 10% inflation rate and a 150% collateralization ratio. They are issued 100 Notes which they then circulate to the community. In one year, Party B \(the Inflation Beneficiary \(IB\)\) withdraws 10 new Notes from the contract. Assuming no price change in the collateral token, there are now 110 Notes backed by 150 collateral tokens, but the system will still be considered fully collateralized. The value of the Notes dropped from being worth $1 to now being worth ~90 cents. Over the next year, the inflationary beneficiary will net 11 new Notes.

The IB address can be set up to distribute the new tokens in a number of different ways to further the goals of the community. Some examples include:

-Pay a dev share

-Pay a non-profit organization

-Reward parties who accept your anthem’s Notes

-Pay parties proportionally to who spends the Notes \(e.g. a cash back scheme\)

### System Ownership

Variables of the system can be changed by an owner. The contract and variables can be locked by setting the owner address to zero. The Anthem ownership can also be set to a governance contract which can have a customized governance policy \(e.g. delegates, token-weighted voting, etc.\) for changing variables in the system.

{% page-ref page="use-cases.md" %}


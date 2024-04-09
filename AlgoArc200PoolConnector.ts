import algosdk, { TransactionSigner } from 'algosdk';
import { getBoxName, getUnnamedResourcesAccessed, nodeClient } from './_shared';
import { Arc200Interface } from './utils';
import { AlgoArc200PoolV02Client } from './AlgoArc200PoolV02Client';

export class AlgoArc200PoolConnector extends AlgoArc200PoolV02Client {
	appId = 0;
	arc200AssetId = 0;
	readonly algodClient: algosdk.Algodv2;
	readonly signer: algosdk.Account;

	constructor(arc200AssetId: number, appId: number, signer: algosdk.Account, algodClient = nodeClient) {
		super({ id: appId, resolveBy: 'id', sender: signer }, algodClient);

		this.algodClient = algodClient;
		this.arc200AssetId = arc200AssetId;
		this.appId = appId;
		this.signer = signer;
	}

	async getUnnamedResourcesAccessedFromMethod<C extends AlgoArc200PoolConnector>(
		methodName: keyof ReturnType<C['compose']>,
		args: any = {},
		txnsBefore: algosdk.Transaction[] = [],
		txnsAfter: algosdk.Transaction[] = []
	) {
		const cl: any = new AlgoArc200PoolV02Client(
			{
				id: this.appId,
				resolveBy: 'id',
				sender: this.signer,
			},
			nodeClient
		);

		const composer = await cl.compose()[methodName](args, {}).atc();
		const txns = composer.buildGroup().map(({ txn }) => txn);

		return getUnnamedResourcesAccessed([...txnsBefore, ...txns, ...txnsAfter]);
	}

	async swapVoiToArc200(voiAmount: bigint, minViaAmount: bigint) {
		const suggestedParams = await nodeClient.getTransactionParams().do();

		const manager = (await nodeClient.getApplicationByID(this.appId).do())?.params?.['global-state']?.find(
			(state) => Buffer.from(state.key, 'base64').toString() === 'manager'
		);

		const managerAddressBase64 = manager?.value?.bytes;

		let managerAddress = '';
		if (managerAddressBase64) {
			managerAddress = algosdk.encodeAddress(new Uint8Array(Buffer.from(managerAddressBase64, 'base64')));
		}

		const swapArgs = () => ({
			payTxnX: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
				amount: voiAmount,
				from: this.signer.addr,
				to: algosdk.getApplicationAddress(this.appId),
				suggestedParams: suggestedParams,
			}),
			minAmountY: minViaAmount,
		});

		const composer = this.compose();
		const opts = await this.getUnnamedResourcesAccessedFromMethod('swapXtoY', swapArgs());
		const atc = await composer
			.swapXtoY(swapArgs(), {
				...opts,
				boxes: opts.boxes,
				accounts: [...new Set([...opts.accounts, managerAddress])],
				apps: [...new Set([...opts.apps, this.arc200AssetId])],
			})
			.atc();

		const swapTxns = atc.buildGroup().map(({ txn }) => txn);

		return swapTxns;
	}

	async swapArc200ToVoi(arc200Amount: bigint, minVoiAmount: bigint) {
		const approveTxns = await Arc200Interface.arc200_approve(
			this.arc200AssetId,
			this.signer.addr,
			algosdk.getApplicationAddress(this.appId),
			BigInt(arc200Amount)
		);

		const manager = (await nodeClient.getApplicationByID(this.appId).do())?.params?.['global-state']?.find(
			(state) => Buffer.from(state.key, 'base64').toString() === 'manager'
		);

		const managerAddressBase64 = manager?.value?.bytes;

		let managerAddress = '';
		if (managerAddressBase64) {
			managerAddress = algosdk.encodeAddress(new Uint8Array(Buffer.from(managerAddressBase64, 'base64')));
		}

		const swapArgs = () => ({
			amountY: arc200Amount,
			minAmountX: minVoiAmount,
		});
		const composer = this.compose();

		for (const approveTxn of approveTxns) {
			approveTxn.group = undefined;
			const signer: TransactionSigner = () => Promise.resolve([])
			composer.addTransaction({
				txn: approveTxn, signer: signer
			});
		}
		const opts = await this.getUnnamedResourcesAccessedFromMethod('swapYtoX', swapArgs(), approveTxns);

		const atc = await composer
			.swapYtoX(swapArgs(), {
				...opts,
				boxes: [
					...opts.boxes,
					{
						appIndex: this.appId,
						name: Uint8Array.from(Buffer.from('666565', 'hex'))
					},
					{
						appIndex: this.arc200AssetId,
						name: getBoxName(algosdk.getApplicationAddress(this.appId)),
					}
				],
				accounts: [...new Set([...opts.accounts, managerAddress])],
				apps: [...new Set([...opts.apps, this.arc200AssetId])],
			})
			.atc();
		const swapTxns = atc.buildGroup().map(({ txn }) => txn);

		return swapTxns;
	}
}

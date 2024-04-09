import { getBoxName, getUnnamedResourcesAccessed, nodeClient } from './_shared';
import { LimitOrders001Client } from './LimitOrders001Client';
import algosdk from 'algosdk';
import { Arc200Interface } from './utils';

// const ADMIN = 'DYX2V5XF4IKOHE55Z63XAHVBJTMYM723HK5WJZ72BDZ5AFEFKJ5YP4DOQQ';

// const SCALE = 100_000_000_000_000;
// const MIN_BALANCE = 1_000_000;

export enum LimitOrderType {
	SELL_ALGO_FOR_ARC200,
	SELL_ARC200_FOR_ALGO,
}

export class LimitOrders001ClientConnector extends LimitOrders001Client {
	appId = 0;
	readonly algodClient: algosdk.Algodv2;
	readonly signer: algosdk.Account;

	constructor(appId: number, signer: algosdk.Account) {
		super({ id: appId, resolveBy: 'id', sender: signer }, nodeClient);

		this.algodClient = nodeClient;
		this.appId = appId;
		this.signer = signer;
	}

	async getUnnamedResourcesAccessedFromMethod<C extends LimitOrders001ClientConnector>(
		methodName: keyof ReturnType<C['compose']>,
		args: any = {},
		txnsBefore: algosdk.Transaction[] = [],
		txnsAfter: algosdk.Transaction[] = []
	) {
		const cl: any = new LimitOrders001Client(
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

	async fillOrder(orderType: LimitOrderType, orderId: number, maker: string, arc200Id: number, amount: bigint, prevTxns: algosdk.Transaction[] = []) {
		if (orderType === LimitOrderType.SELL_ALGO_FOR_ARC200) {
			const approveTxns = await Arc200Interface.arc200_approve(
				arc200Id,
				this.signer.addr,
				algosdk.getApplicationAddress(this.appId),
				amount
			);
			const args = () => ({
				orderId: orderId,
				arc200Amount: amount,
			});
			const resources = await this.getUnnamedResourcesAccessedFromMethod('fillAlgoToArc200Order', args(), [...prevTxns, ...approveTxns]);

			const foreignApps = <number[]>[...new Set([...resources.apps, arc200Id, ...resources.boxes.map(box => box.appIndex)])];

			const atc = await this.compose()
				.fillAlgoToArc200Order(
					{
						orderId: orderId,
						arc200Amount: amount,
					},
					{
						...resources,
						boxes: [
							...resources.boxes,
							{
								appIndex: arc200Id,
								name: getBoxName(this.signer.addr),
							},
							{
								appIndex: arc200Id,
								name: getBoxName(maker),
							},
						],
						apps: foreignApps,
					}
				)
				.atc();
			return [...approveTxns, ...atc.buildGroup().map((t) => t.txn)];
		} else if (orderType === LimitOrderType.SELL_ARC200_FOR_ALGO) {
			const suggestedParams = await nodeClient.getTransactionParams().do();

			const args = () => ({
				orderId: orderId,
				algoPayTxn: algosdk.makePaymentTxnWithSuggestedParamsFromObject({
					from: this.signer.addr,
					to: algosdk.getApplicationAddress(this.appId),
					amount: amount,
					suggestedParams: suggestedParams,
				}),
			});
			const resources = await this.getUnnamedResourcesAccessedFromMethod('fillArc200ToAlgoOrder', args(), prevTxns);

			const foreignApps = <number[]>[...new Set([...resources.apps, arc200Id, ...resources.boxes.map(box => box.appIndex)])];

			const atc = await this.compose()
				.fillArc200ToAlgoOrder(args(), {
					...resources,
					boxes: [
						...resources.boxes ?? []
					],
					apps: foreignApps
				})
				.atc();
			return atc.buildGroup().map((t) => t.txn);
		} else {
			console.error('unknown order type');
		}
	}
}

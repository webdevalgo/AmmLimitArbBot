import algosdk from 'algosdk';
import Contract from 'arc200js';
import { nodeClient } from './_shared';

export class Arc200Interface {
	static async arc200_name(appId: number) {
		const contract = new Contract(appId, nodeClient, undefined);
		const response = await contract.arc200_name();
		if (response.success) {
			return response.returnValue;
		} else {
			throw Error('failed to fetch arc200 name');
		}
	}

	static async arc200_symbol(appId: number) {
		const contract = new Contract(appId, nodeClient, undefined);
		const response = await contract.arc200_symbol();
		if (response.success) {
			return response.returnValue;
		} else {
			throw Error('failed to fetch arc200 symbol');
		}
	}

	static async arc200_totalSupply(appId: number) {
		const contract = new Contract(appId, nodeClient, undefined);
		const response = await contract.arc200_totalSupply();
		if (response.success) {
			return response.returnValue;
		} else {
			throw Error('failed to fetch arc200 total supply');
		}
	}

	static async arc200_decimals(appId: number) {
		const contract = new Contract(appId, nodeClient, undefined);
		const response = await contract.arc200_decimals();
		if (response.success) {
			return response.returnValue;
		} else {
			throw Error('failed to fetch arc200 decimals');
		}
	}

	static async arc200_balanceOf(appId: number, owner: string) {
		const contract = new Contract(appId, nodeClient, undefined);
		const response = await contract.arc200_balanceOf(owner);
		if (response.success) {
			return response.returnValue;
		} else {
			throw Error('failed to fetch arc200 balance');
		}
	}

	static async arc200_transfer(appId: number, from: string, addrTo: string, amt: bigint) {
		const contract = new Contract(appId, nodeClient, undefined, {
			acc: { addr: from, sk: Uint8Array.from([]) },
			simulate: true,
		});
		const res: any = await contract.arc200_transfer(addrTo, amt, true, false);
		return <algosdk.Transaction[]>(
			res.txns?.map((txn) => algosdk.decodeUnsignedTransaction(Buffer.from(txn, 'base64'))).filter(Boolean)
		);
	}

	static async arc200_transferFrom(appId: number, from: string, addrFrom: string, addrTo: string, amt: bigint) {
		const contract = new Contract(appId, nodeClient, undefined, {
			acc: { addr: from, sk: Uint8Array.from([]) },
			simulate: true,
		});
		const res: any = await contract.arc200_transferFrom(addrFrom, addrTo, amt, true, false);
		return <algosdk.Transaction[]>(
			res.txns?.map((txn) => algosdk.decodeUnsignedTransaction(Buffer.from(txn, 'base64'))).filter(Boolean)
		);
	}

	static async arc200_approve(appId: number, from: string, addrTo: string, amt: bigint) {
		const contract = new Contract(appId, nodeClient, undefined, {
			acc: { addr: from, sk: Uint8Array.from([]) },
			simulate: true,
		});
		const res: any = await contract.arc200_approve(addrTo, amt, true, false);
		return <algosdk.Transaction[]>(
			res.txns?.map((txn) => algosdk.decodeUnsignedTransaction(Buffer.from(txn, 'base64'))).filter(Boolean)
		);
	}
}
import algosdk from "algosdk";
import { Arc200Interface } from "./utils";

export async function buildArc200OptinTxns(arc200Id: number, from: string, addresses: string[] = []): Promise<algosdk.Transaction[]> {
    const txns: algosdk.Transaction[] = [];;
    for (const address of addresses) {
        const balance = await Arc200Interface.arc200_balanceOf(arc200Id, address);
        if (balance < 1n) {
            const _txns = await Arc200Interface.arc200_transfer(arc200Id, from, address, from === address ? 0n : 1n);
            txns.push(..._txns ?? []);
        }
    }
    return txns;
}
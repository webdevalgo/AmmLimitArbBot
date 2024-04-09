import algosdk, { AtomicTransactionComposer, EncodedSignedTransaction } from "algosdk";
import { AlgoArc200PoolConnector } from "./AlgoArc200PoolConnector";

export const nodeClient = new algosdk.Algodv2(
    '', 'https://testnet-api.voi.nodly.io', '',
);

export const getBoxName = (addr: string) => {
    const box = new Uint8Array(33).fill(0);
    box.set(algosdk.decodeAddress(addr).publicKey, 1);
    return box;
};

export async function getUnnamedResourcesAccessed(txns: algosdk.Transaction[]) {
    const signer = algosdk.makeEmptyTransactionSigner();
    txns = txns.map((txn) => algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(txn)));

    for (const txn of txns) {
        txn.group = undefined;
    }

    algosdk.assignGroupID(txns);

    const signed = await signer(
        txns,
        txns.map((_, i) => i)
    );

    const request = new algosdk.modelsv2.SimulateRequest({
        txnGroups: [
            new algosdk.modelsv2.SimulateRequestTransactionGroup({
                txns: <EncodedSignedTransaction[]>signed.map(algosdk.decodeObj),
            }),
        ],
        allowUnnamedResources: true,
        allowEmptySignatures: true,
    });

    const simulated = await nodeClient.simulateTransactions(request).do();

    return {
        apps: (simulated.txnGroups[0].unnamedResourcesAccessed?.apps ?? []).map((n) => Number(n)),
        assets: (simulated.txnGroups[0].unnamedResourcesAccessed?.assets ?? []).map((n) => Number(n)),
        boxes: (simulated.txnGroups[0].unnamedResourcesAccessed?.boxes ?? []).map((box) => ({
            appIndex: Number(box.app),
            name: box.name,
        })),
        accounts: simulated.txnGroups[0].unnamedResourcesAccessed?.accounts ?? [],
        simulated,
    };
}

export async function getUnnamedResourcesAccessedFromComposer(composer: AtomicTransactionComposer) {
    const txns = composer.buildGroup().map(({ txn }) => txn);
    return getUnnamedResourcesAccessed(txns);
}

export async function getUnnamedResourcesAccessedFromMethod<C extends AlgoArc200PoolConnector>(
    client: C,
    methodName: keyof ReturnType<C['compose']>,
    args: any = {}
) {
    const cl: any = client;
    const composer: AtomicTransactionComposer = await cl.compose()[methodName](args, {}).atc();
    return getUnnamedResourcesAccessedFromComposer(composer);
}

export function powerOfTen(decimals: number | bigint): bigint {
    let result = 1n;

    for (let i = 0; i < Number(decimals); i = i + 1) {
        result = result * 10n;
    }

    return result;
}


export function convertDecimals(amount: bigint | number, decimals: bigint | number, targetDecimals: bigint | number) {
    return (BigInt(amount) * powerOfTen(targetDecimals)) / powerOfTen(decimals);
}

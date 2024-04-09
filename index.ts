import algosdk from 'algosdk';
import { MNEMONIC } from './mnemonic';
import { convertDecimals, nodeClient } from './_shared';
import { LimitOrderType, LimitOrders001ClientConnector } from './LimitOrderConnector';
import { AlgoArc200PoolConnector } from './AlgoArc200PoolConnector';
import { knownPools, knownTokens } from './consts';
import { Arc200Interface } from './utils';
import { calculateOutTokens, calculateSwappableAmount } from './numbers2';
import { buildArc200OptinTxns } from './helpers';

type Order = {
    orderId: number;
    maker: string;
    algoAmount: bigint; // tokenXAmount
    arc200Id: bigint;
    arc200Amount: bigint; // tokenYAmount
    arc200Token: typeof knownTokens[0];
    isBuyingAlgo: boolean; // true if buying Algo, false otherwise
};

type Orderbook = Order[];

const contracts = {
    orderbookLimitOrderApp: 26171479,
};

const account = algosdk.mnemonicToSecretKey(MNEMONIC);

const MIN_ORDER_AMOUNT = 1_000;


class Bot {
    private stopped = true;

    static orderPrice(order: Order) {
        const price = Number((order.algoAmount * 10n ** 6n) / convertDecimals(order.arc200Amount, order.arc200Token.decimals, 6)) / 1e6;
        return 1 / price;
    }

    async getAlgoBalance() {
        const accInfo = (await nodeClient.accountInformation(account.addr).do());
        return accInfo['amount'] - accInfo['min-balance'] - 10_000_000;
    }

    async getAmmInfo(arc200Id: number) {
        const poolId = knownPools[arc200Id];
        if (!poolId) throw Error('pool not found');
        const poolAddress = algosdk.getApplicationAddress(poolId);
        const poolAccountInfo = await nodeClient.accountInformation(poolAddress).do();
        const arc200Balance = await Arc200Interface.arc200_balanceOf(arc200Id, poolAddress);
        return {
            poolId,
            arc200Id,
            algoBalance: poolAccountInfo['amount'] - poolAccountInfo['min-balance'],
            arc200Balance: arc200Balance
        };
    }

    private cachedOrders: { timestamp: number, orders: Orderbook } | undefined;

    async fetchOrders(arc200Id: bigint | number): Promise<Orderbook> {
        try {
            if (this.cachedOrders && ((Date.now() - this.cachedOrders.timestamp) < 2_000)) {
                return this.cachedOrders.orders.filter(o => o.arc200Token && Number(o.arc200Id) === Number(arc200Id));
            }

            const { boxes: boxesNames } = await nodeClient.getApplicationBoxes(contracts.orderbookLimitOrderApp).do();

            const boxes = await Promise.all(
                boxesNames.map((box) => nodeClient.getApplicationBoxByName(contracts.orderbookLimitOrderApp, box.name).do())
            );

            const orders = boxes
                .map((box) => {
                    const [maker, arc200Id, algoAmount, arc200Amount, isBuyingAlgo] = <
                        [string, bigint, bigint, bigint, bigint]
                        >algosdk.ABITupleType.from('(address,uint64,uint64,uint256,uint8)').decode(box.value);
                    return {
                        orderId: Number('0x' + Buffer.from(box.name).toString('hex')),
                        maker,
                        arc200Id: arc200Id,
                        algoAmount: algoAmount,
                        arc200Amount,
                        arc200Token: <typeof knownTokens[0]>knownTokens.find(tok => Number(tok.id) === Number(arc200Id)),
                        isBuyingAlgo: Boolean(Number(isBuyingAlgo))
                    };
                });
            this.cachedOrders = { timestamp: Date.now(), orders };
            return orders.filter(o => o.arc200Token && Number(o.arc200Id) === Number(arc200Id));
        } catch (e) {
            console.log(e);
            return [];
        }
    }

    async tick(arc200Id: number) {
        const arc200Token = knownTokens.find(tok => tok.id === arc200Id);
        if (!arc200Token) throw Error('token now found');

        const orderbook = await this.fetchOrders(arc200Id);
        const feePerecnt = 1;

        const bestBuyOrders = orderbook
            .sort((a, b) => a.orderId - b.orderId)
            .sort((a, b) => Bot.orderPrice(b) - Bot.orderPrice(a))
            .filter(o => o.isBuyingAlgo)
            .filter(o => o.algoAmount > MIN_ORDER_AMOUNT)
            .map(o => ({ ...o, price: Bot.orderPrice(o) }));

        const bestSellOrders = orderbook
            .sort((a, b) => a.orderId - b.orderId)
            .sort((a, b) => Bot.orderPrice(a) - Bot.orderPrice(b))
            .filter(o => !o.isBuyingAlgo)
            .filter(o => o.algoAmount > MIN_ORDER_AMOUNT)
            .map(o => ({ ...o, price: Bot.orderPrice(o) }));
        const bestBuyOrder = bestBuyOrders[0]; // best buy order is giving most arc200 for algo
        const bestSellOrder = bestSellOrders[0];  // best sell order is taking least arc200 for algo

        const limitOrderConnector = new LimitOrders001ClientConnector(contracts.orderbookLimitOrderApp, account);

        if (bestBuyOrder && bestSellOrder && bestBuyOrder.price >= bestSellOrder.price) {
            process.stdout.write('.');
            const commonAlgoAmount = Math.min(
                await this.getAlgoBalance(),
                (Math.min(Number(bestSellOrder.algoAmount), Number(bestBuyOrder.algoAmount)) * (100 + feePerecnt)) / 100
            );
            const targetArc200Amount = Math.min(
                Number(bestSellOrder.arc200Amount),
                Number(convertDecimals(BigInt(Math.floor(commonAlgoAmount * bestBuyOrder.price)), 6, bestBuyOrder.arc200Token.decimals))
            );

            if (targetArc200Amount < 1n) return;

            const txns1 = <algosdk.Transaction[]>(await limitOrderConnector.fillOrder(
                LimitOrderType.SELL_ARC200_FOR_ALGO,
                bestBuyOrder.orderId,
                bestBuyOrder.maker,
                arc200Id,
                BigInt(Math.floor(commonAlgoAmount))
            ));

            const txns2 = <algosdk.Transaction[]>(await limitOrderConnector.fillOrder(
                LimitOrderType.SELL_ALGO_FOR_ARC200,
                bestSellOrder.orderId,
                bestSellOrder.maker,
                arc200Id,
                BigInt(targetArc200Amount)
            ));

            const txns = [...txns1, ...txns2].map(txn => {
                txn.group = undefined;
                return txn;
            });

            const atc = new algosdk.AtomicTransactionComposer();
            const basicSigner = algosdk.makeBasicAccountTransactionSigner(account);
            for (const txn of txns) {
                atc.addTransaction({ txn: txn, signer: basicSigner });
            }
            const result = await atc.execute(nodeClient, 4);
            console.log('Confirmed Txns:', result?.txIDs?.length);
        } else {
            const ammInfo = await this.getAmmInfo(arc200Id);
            const ammPrice = (
                Number(convertDecimals(ammInfo.arc200Balance, arc200Token.decimals, 6)) /
                Number(convertDecimals(ammInfo.algoBalance, 6, 6))
            );

            const ammConnector = new AlgoArc200PoolConnector(arc200Id, ammInfo.poolId, account);
            if (bestSellOrder && bestSellOrder.price < ammPrice) {
                process.stdout.write('/');
                const price = bestSellOrder.price;
                // console.log(price, arc200Token.ticker);
                const swapable = calculateSwappableAmount(
                    BigInt(ammInfo.algoBalance),
                    ammInfo.arc200Balance,
                    6,
                    arc200Token.decimals,
                    price
                );

                // console.log(swapable);
                const commonAlgoAmount = Math.min((await this.getAlgoBalance()), Number(swapable), Number(bestSellOrder.algoAmount));

                if (commonAlgoAmount >= MIN_ORDER_AMOUNT && swapable >= MIN_ORDER_AMOUNT) {
                    let targetArc200Amount = (convertDecimals(
                        BigInt(Math.floor(commonAlgoAmount * bestSellOrder.price)),
                        6,
                        arc200Token.decimals
                    ) * 9999n) / 10000n;

                    if (targetArc200Amount < 1n) return;
                    console.log('amm to ob', commonAlgoAmount / 1e6, 'algo for', Number(targetArc200Amount) / arc200Token.unit, arc200Token.ticker);

                    const txns0 = <algosdk.Transaction[]>(
                        await buildArc200OptinTxns(
                            arc200Token.id,
                            account.addr,
                            [algosdk.getApplicationAddress(contracts.orderbookLimitOrderApp)]
                        )
                    );

                    const txns1 = await ammConnector.swapVoiToArc200(
                        BigInt(Math.floor(commonAlgoAmount)),
                        targetArc200Amount
                    );

                    const txns2 = <algosdk.Transaction[]>(await limitOrderConnector.fillOrder(
                        LimitOrderType.SELL_ALGO_FOR_ARC200,
                        bestSellOrder.orderId,
                        bestSellOrder.maker,
                        arc200Id,
                        targetArc200Amount
                    ));

                    const txns = [...txns0, ...txns1, ...txns2].map(txn => {
                        txn.group = undefined;
                        return txn;
                    });

                    const atc = new algosdk.AtomicTransactionComposer();
                    const basicSigner = algosdk.makeBasicAccountTransactionSigner(account);
                    for (const txn of txns) {
                        atc.addTransaction({ txn: txn, signer: basicSigner });
                    }

                    const result = await atc.execute(nodeClient, 4);
                    console.log('Confirmed Txns:', result?.txIDs?.length);
                }
            } else if (bestBuyOrder && ammPrice < bestBuyOrder.price) {
                process.stdout.write('\\');
                const price = 1 / bestBuyOrder.price;
                const swapable = calculateOutTokens(
                    (
                        calculateSwappableAmount(
                            ammInfo.arc200Balance,
                            BigInt(ammInfo.algoBalance),
                            arc200Token.decimals,
                            6,
                            price
                        )
                    ),
                    ammInfo.arc200Balance,
                    BigInt(ammInfo.algoBalance),
                    1_000_000_000_000n
                );
                const algoBalanceBefore = await this.getAlgoBalance();

                let commonAlgoAmount = Math.min(Math.floor(algoBalanceBefore), Number(swapable), Number(bestBuyOrder.algoAmount));

                if (commonAlgoAmount >= MIN_ORDER_AMOUNT && swapable >= MIN_ORDER_AMOUNT) {
                    const targetArc200Amount = (convertDecimals(
                        BigInt(Math.floor(commonAlgoAmount * bestBuyOrder.price)),
                        6,
                        arc200Token.decimals
                    ) * 9_850n) / 10_000n;

                    if (targetArc200Amount < 1n) return;
                    console.log(
                        '\nob to amm', Number(targetArc200Amount) / 1e6, `${arc200Token.ticker} to`, commonAlgoAmount / 1e6, 'Algo'
                    );
                    // return;
                    const txns0 = <algosdk.Transaction[]>(
                        await buildArc200OptinTxns(
                            arc200Token.id,
                            account.addr,
                            [algosdk.getApplicationAddress(contracts.orderbookLimitOrderApp)]
                        )
                    );

                    const txns1 = <algosdk.Transaction[]>(await limitOrderConnector.fillOrder(
                        LimitOrderType.SELL_ARC200_FOR_ALGO,
                        bestBuyOrder.orderId,
                        bestBuyOrder.maker,
                        arc200Id,
                        BigInt(Math.floor(commonAlgoAmount))
                    ));

                    const txns2 = await ammConnector.swapArc200ToVoi(
                        targetArc200Amount,
                        convertDecimals((Math.floor(Number(targetArc200Amount) / bestBuyOrder.price)), arc200Token.decimals, 6),
                    );

                    // const suggestedParams = await nodeClient.getTransactionParams().do();
                    // const verifyBalanceTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
                    //     amount: algoBalanceBefore,
                    //     from: account.addr,
                    //     to: account.addr,
                    //     suggestedParams: suggestedParams
                    // });

                    const txns = [...txns0, ...txns1, ...txns2].map(txn => {
                        txn.group = undefined;
                        return txn;
                    });

                    const atc = new algosdk.AtomicTransactionComposer();
                    const basicSigner = algosdk.makeBasicAccountTransactionSigner(account);
                    for (const txn of txns) {
                        atc.addTransaction({ txn: txn, signer: basicSigner });
                    }

                    const result = await atc.execute(nodeClient, 4);
                    console.log('Confirmed Txns:', result?.txIDs?.length);
                }
            }
        }
    }

    async start(arc200Id: number) {
        this.stopped = false;
        while (!this.stopped) {
            const startAt = Date.now();
            try {
                await this.tick(arc200Id);
            } catch (e) {
                console.log(e.message);
            }
            const finishAt = Date.now();
            if ((finishAt - startAt) < 2_800) {
                await new Promise(r => setTimeout(r, Math.max(0, 2_800 - (finishAt - startAt))));
            }
        }
    }
    async stop() {
        this.stopped = true;
    }
}

const bot = new Bot();


for (const token of knownTokens) {
    bot.start(token.id);
}
// setTimeout(() => bot.stop(), 5000);
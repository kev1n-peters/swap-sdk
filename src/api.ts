import fetch from 'cross-fetch';
import {
	Token,
	ChainName,
	QuoteParams,
	Quote,
	QuoteOptions,
	QuoteError,
	SolanaClientSwap,
	GetSolanaSwapParams
} from './types';
import addresses from './addresses';
import { checkSdkVersionSupport, getSdkVersion } from './utils';
import { SwiftEvmGasLessParams } from './evm/evmSwift';

function toQueryString(params: Record<string, any>): string {
	return Object.entries(params)
		.filter(([_, value]) => value !== undefined && value !== null && !Array.isArray(value))
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join('&');
}

async function check5xxError(res: Response): Promise<void> {
	if (res.status.toString().startsWith('5')) {
		let error: Error | QuoteError;
		try {
			const err = await res.json();
			if (err.code && (err?.message || err?.msg)) {
				error = {
					code: err.code,
					message: err?.message || err?.msg,
				} as QuoteError
			}
		} catch (err) {
			error = new Error('Internal server error');
		}
		throw error;
	}
}

export async function fetchAllTokenList(): Promise<{[index: string]: Token[]}> {
	const res = await fetch(`${addresses.PRICE_URL}/tokens`, {
		method: 'GET',
		redirect: 'follow',
	});
	await check5xxError(res);
	if (res.status === 200) {
		const result = await res.json();
		return result as { [index: string]: Token[] };
	}
	throw new Error('Cannot fetch Mayan tokens!');
}

export async function fetchTokenList(chain: ChainName, nonPortal: boolean = false): Promise<Token[]> {
	const res = await fetch(`${addresses.PRICE_URL}/tokens?chain=${chain}${nonPortal ? '&nonPortal=true' : ''}`);
	await check5xxError(res);
	if (res.status === 200) {
		const result = await res.json();
		return result[chain] as Token[];
	}
	throw new Error('Cannot fetch Mayan tokens!');
}

export async function fetchQuote(params: QuoteParams, quoteOptions: QuoteOptions = {
	swift: true,
	mctp: true,
	gasless: false,
	onlyDirect: false,
}): Promise<Quote[]> {
	const { gasDrop, referrerBps } = params;
	let slippageBps = params.slippageBps;
	if (!Number.isFinite(slippageBps)) {
		slippageBps = params.slippage * 100;
	}
	const _quoteOptions: QuoteOptions = {
		swift: quoteOptions.swift !== false, // default to true
		mctp: quoteOptions.mctp !== false, // default to true
		gasless: quoteOptions.gasless === true, // default to false
		onlyDirect: quoteOptions.onlyDirect === true, // default to false
	}
	const queryParams: Record<string, any> = {
		..._quoteOptions,
		solanaProgram: addresses.MAYAN_PROGRAM_ID,
		forwarderAddress: addresses.MAYAN_FORWARDER_CONTRACT,
		amountIn: Number.isFinite(params.amount) ? params.amount : undefined,
		fromToken: params.fromToken,
		fromChain: params.fromChain,
		toToken: params.toToken,
		toChain: params.toChain,
		slippageBps,
		referrer: params.referrer,
		referrerBps: Number.isFinite(referrerBps) ? referrerBps : undefined,
		gasDrop: Number.isFinite(gasDrop) ? gasDrop : undefined,
		sdkVersion: getSdkVersion(),
	};
	const baseUrl = `${addresses.PRICE_URL}/quote?`;
	const queryString = toQueryString(queryParams);
	const url = baseUrl + queryString;
	const res = await fetch(url, {
		method: 'GET',
		redirect: 'follow',
	});
	await check5xxError(res);
	const result = await res.json();
	if (res.status !== 200 && res.status !== 201) {
		throw {
			code: result?.code || 0,
			message: result?.msg || 'Route not found',
		} as QuoteError
	}
	if (!checkSdkVersionSupport(result.minimumSdkVersion)) {
		throw {
			code: 9999,
			message: 'Swap SDK is outdated!',
		} as QuoteError
	}
	return result.quotes as Quote[];
}

export async function getCurrentChainTime(chain: ChainName): Promise<number> {
	const res = await fetch(`${addresses.PRICE_URL}/clock/${chain}`, {
		method: 'GET',
		redirect: 'follow',
	});
	await check5xxError(res);
	const result = await res.json();
	if (res.status !== 200 && res.status !== 201) {
		throw result;
	}
	return result.clock;
}

export async function getSuggestedRelayer(): Promise<string> {
	const res = await fetch(`${addresses.RELAYER_URL}/active-relayers?solanaProgram=${addresses.MAYAN_PROGRAM_ID}`, {
		method: 'GET',
		redirect: 'follow',
	});
	await check5xxError(res);
	const result = await res.json();
	if (res.status !== 200 && res.status !== 201) {
		throw result;
	}
	return result.suggested;
}


export async function getSwapSolana(params : GetSolanaSwapParams): Promise<SolanaClientSwap> {
	const query = toQueryString(params);
	const res = await fetch(`${addresses.PRICE_URL}/get-swap/solana?${query}`, {
		method: 'GET',
		redirect: 'follow',
	});
	await check5xxError(res);
	const result = await res.json();
	if (res.status !== 200 && res.status !== 201) {
		throw result;
	}
	return result;
}

export async function submitSwiftEvmSwap(params: SwiftEvmGasLessParams, signature: string): Promise<void> {
	const res = await fetch(`${addresses.EXPLORER_URL}/submit/evm`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			...params,
			signature,
		}, (_key, value) => {
			if (typeof value === 'bigint') {
				return value.toString();
			}
			return value;
		}),
	});
	await check5xxError(res);
}

export async function submitSwiftSolanaSwap(signedTx: string): Promise<{ orderHash: string }> {
	const res = await fetch(`${addresses.EXPLORER_URL}/submit/solana`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			signedTx,
		}),
	});
	await check5xxError(res);
	const result = await res.json();
	if (res.status !== 200 && res.status !== 201) {
		throw result;
	}
	return result;
}

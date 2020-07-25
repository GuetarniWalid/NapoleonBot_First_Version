const axios = require('axios').default
const crypto = require('crypto')
const config = require('./config')
const secretKey = config.BinanceSecretKey;
axios.defaults.headers.common['X-MBX-APIKEY'] = config.BinancePublicKey;
axios.defaults.headers.common['Content-Type'] = 'application/x-www-form-urlencoded';

class BinanceBot {

    async getWalletBalance() {
        const timestamp = Date.now();
        const baseURL = `https://api.binance.com/sapi/v1/capital/config/getall`;
        const message = `timestamp=${timestamp}`;
        const hmac = crypto.createHmac('sha256', secretKey);
        hmac.update(message);
        const queryURL = `${baseURL}?${message}&signature=${hmac.digest('hex')}`;

        try {
            let balance = await axios.get(queryURL);
            const balanceBTC = balance.data.filter(obj => obj.coin === 'BTC');
            const balanceETH = balance.data.filter(obj => obj.coin === 'ETH');
            const balanceUSDT = balance.data.filter(obj => obj.coin === 'USDT');
            
            balance = {
                BTC: balanceBTC[0].free,
                ETH: balanceETH[0].free,
                USDT: balanceUSDT[0].free
            }
            return balance;

        } catch (error) {
            console.log(error);
            throw new Error('Error at request getWalletBalance to Binance.\n Check that your secretKey and publicKey are correct.\n');
        }
    }


    async getCurrentAvgPrice(crypto) {
        const baseURL = `https://api.binance.com/api/v3/avgPrice`;
        try {
            let dataAvgPrice = await axios.get(`${baseURL}?symbol=${crypto}USDT`, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });
            const avgPrice = dataAvgPrice.data.price;
            return avgPrice;
        } catch (error) {
            console.log(error);
            throw new Error('Error at request getCurrentAvgPrice to Binance.\nThe error comes from Binance.\nFor today place your orders manually.\n');
        }
    }

    async currencyPriceInUSDT() {
        try {
            const ETHprice = await this.getCurrentAvgPrice('ETH');
            const BTCprice = await this.getCurrentAvgPrice('BTC');
            const balanceBRUT = await this.getWalletBalance();
            const currencyPriceInUSDT = {
                BTC: BTCprice * balanceBRUT.BTC,
                ETH: ETHprice * balanceBRUT.ETH,
                USDT: parseInt(balanceBRUT.USDT)
            }
            return currencyPriceInUSDT;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async currentWalletPosition() {
        try {
            let countCurrencyPlusOf10USDT = 0;
            const position = {};
            const currencyPriceInUSDT = await this.currencyPriceInUSDT();
            if (currencyPriceInUSDT.BTC < 100 && currencyPriceInUSDT.ETH < 100 && currencyPriceInUSDT.USDT < 100) {
                throw new Error('You don\'t have enough liquidity on Binance.\nThis bot can only trade with available funds.\nPlease add for more than 150$ in BTC, ETH or USDT.');
            };
            for (const currency in currencyPriceInUSDT) {
                currencyPriceInUSDT[currency] > 100 ? countCurrencyPlusOf10USDT++ : null;
            };
            for (const currency in currencyPriceInUSDT) {
                if (countCurrencyPlusOf10USDT > 1) {
                    currencyPriceInUSDT[currency] > 100 ? position[currency] = 0.5 : position[currency] = 0;
                }
                else {
                    currencyPriceInUSDT[currency] > 100 ? position[currency] = 1 : position[currency] = 0;
                }
            };
            return position;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    PairAndSideForTrade(currencyWin, currencyLoss) {
        let pair = 'BTCUSDT';
        let side;
        if (currencyWin === 'ETH') {
            pair = currencyWin + currencyLoss;
            side = 'BUY';
        }
        else if (currencyLoss === 'ETH') {
            pair = currencyLoss + currencyWin;
            side = 'SELL';
        }
        else if (currencyWin === 'BTC') side = 'BUY';
        else side = 'SELL';
        return { side, pair };
    }

    async convertQuantity(qty, currencyLoss, pair) {
        let currencyLossPriceInUSDT;
        const currencyParent = pair.slice(0, 3);
        const currencyParentPriceInUSDT = await this.getCurrentAvgPrice(currencyParent);
        currencyLoss === 'USDT' ? currencyLossPriceInUSDT = 1 : currencyLossPriceInUSDT = await this.getCurrentAvgPrice(currencyLoss);
        const quantity = qty * currencyLossPriceInUSDT / currencyParentPriceInUSDT;
        return quantity;
    }

    cleanQuantity(pair, qty) {
        let quantity;
        const currencyParent = pair.slice(0, 3);
        if(currencyParent === 'BTC') quantity = (qty - 0.003).toFixed(6);
        else quantity = (qty - 0.14).toFixed(3);
        return quantity;
    }


    async trade(currencyWin, currencyLoss, percent) {
        try {
            const {pair, side} = this.PairAndSideForTrade(currencyWin, currencyLoss);
            const balance = await this.getWalletBalance();            
            const quantityBrut = balance[currencyLoss] * percent / 100;
            const quantityConverted = await this.convertQuantity(quantityBrut, currencyLoss, pair);
            const quantity = this.cleanQuantity(pair, quantityConverted);
            const timestamp = Date.now();
            const baseURL = `https://api.binance.com/api/v3/order`;
            const message = `symbol=${pair}&side=${side}&type=MARKET&quantity=${quantity}&newOrderRespType=RESULT&recvWindow=10000&timestamp=${timestamp}`;
            const hmac = crypto.createHmac('sha256', config.BinanceSecretKey);
            hmac.update(message);
            const queryURL = `${baseURL}?${message}&signature=${hmac.digest('hex')}`;

            let order = await axios.post(queryURL);
            const result = order.data;
            return result;
        } catch (error) {
            console.log(error);
            throw new Error('Error at request trade to Binance.\nCheck your API authorization levels (to Binance in parameter, section security , settings, API Management and tick Enable Trading.)\n\n' + error) ;
        }
    }
}

module.exports = BinanceBot;

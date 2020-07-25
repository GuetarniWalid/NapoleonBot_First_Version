const NapoleonBot = require('./Napoleon');
const nodemailer = require("nodemailer");
const BinanceBot = require('./binance');
const CronJob = require('cron').CronJob;
const config = require('./config');
const Napoleon = new NapoleonBot();
const Binance = new BinanceBot();

//Count errors
let errorNum = 0;
let dateAlreadyChecked = false;

class TradingBot {

    async compareNewPositionWithWallet() {
        try {
            const todayNapoleonPosition = await Napoleon.getTodayPosition(dateAlreadyChecked);
            const currentWalletPosition = await Binance.currentWalletPosition();
            const advancedPosition = {
                BTC: todayNapoleonPosition.BTC - currentWalletPosition.BTC,
                ETH: todayNapoleonPosition.ETH - currentWalletPosition.ETH,
                USDT: todayNapoleonPosition.USDT - currentWalletPosition.USDT
            }
            return advancedPosition;
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    async tradingOrder() {
        try {
            const advancedPosition = await this.compareNewPositionWithWallet();
            const currentWalletPosition = await Binance.currentWalletPosition();
            let currencyLoss = [];
            let currencyWin = [];
            let percent;
            for (const currency in advancedPosition) {
                if (advancedPosition[currency] > 0) {
                    currencyWin.push(currency);
                    percent = advancedPosition[currency] * 100;
                }
                if (advancedPosition[currency] < 0) {
                    currencyLoss.push(currency);
                }
            }

            if (!currencyWin.length)
                throw new Error('Aucune prise de position aujourd\'hui')

            else if (currencyWin.length === 2) {
                currencyWin.forEach(currency => {
                    Binance.trade(currency, currencyLoss[0], 50)
                        .then(result => {
                            this.mail(null, result)
                        })
                        .catch(error => this.mail(error))
                });
            }

            else if (currencyLoss.length === 2) {
                currencyLoss.forEach(currency => {
                    Binance.trade(currencyWin[0], currency, 100)
                        .then(result => {
                            this.mail(null, result)
                        })
                        .catch(error => this.mail(error))
                });
            }

            else {
                currentWalletPosition[currencyWin[0]] === 0.5 ? percent = 100 : null;

                Binance.trade(currencyWin[0], currencyLoss[0], percent)
                    .then(result => {
                        this.mail(null, result)
                    })
                    .catch(error => this.mail(error));
            }
        } catch (error) {
            errorNum++;
            if (error.message !== 'Dates do not match')
                dateAlreadyChecked = true;
            if (errorNum < 3) this.restart(1);
            else if (errorNum < 6) this.restart(10);
            else {
                this.mail(error);
            }
        }
    }

    restart(minute) {
        setTimeout(() => {
            this.tradingOrder()
        }, minute * 60000)
    }

    start() {
        const job = new CronJob('45 23 * * *', () => {
            this.tradingOrder();
        }, null, true);
    }


    mail(err, mess) {
        errorNum = 0;
        let message = '';
        dateAlreadyChecked = false;
        const date = new Date();
        for (const prop in mess) {
            if (prop === 'symbol' || prop === 'origQty' || prop === 'executedQty' || prop === 'status' || prop === 'type' || prop === 'side') {
                message += `${prop} : ${mess[prop]}<br>`
            }
        }
        const finalMessage = `<h2>Prise de position : </h2><br>${message}`

        let transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: config.GmailBot,
                pass: config.GmailPasswordBot
            }
        });

        if (err) {
            transporter.sendMail({
                from: `"Napoleon BOT 👻" <${config.GmailBot}>`,
                to: config.GmailUser,
                subject: `Today position: ${date.toLocaleString()}`,
                html: err.message
            });
        } else {
            transporter.sendMail({
                from: `"Napoleon BOT 🤖" <${config.GmailBot}>`,
                to: config.GmailUser,
                subject: `Today position: ${date.toLocaleString()}`,
                html: finalMessage
            });
        }
    }
}

const bot = new TradingBot();
bot.start();

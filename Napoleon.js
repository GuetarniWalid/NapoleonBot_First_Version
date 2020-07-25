const axios = require('axios').default;
const config = require('./config')


class NapoleonBot {

    async getTodayPosition(dateAlreadyChecked) {
        try {
            const result = await axios.post('https://crypto-user-service.napoleonx.ai/v1/platform/authentification', {
                username: config.NapoleonUsername,
                password: config.NapoleonPassword
            });
            const token = result.data.access_token;
            const stratPosition = await axios.post('https://crypto-user-service.napoleonx.ai/v1/platform/getbotdetails', {
                access_token: token,
                email: config.NapoleonUsername,
                product_code: 'STRAT_BTC_ETH_USD_LO_D_1'
            });
            if (this.checkTodayDate(stratPosition) || dateAlreadyChecked) {
                const position = stratPosition.data.data.current_position2;
                const currentPosition = {
                    BTC: position['BTC-USD'],
                    ETH: position['ETH-USD'],
                    USDT: 1 - position['BTC-USD'] - position['ETH-USD']
                }
                return currentPosition;
            }
            else
                throw new Error('Dates do not match');
        } catch (error) {
            console.log(error);
            if (error.message === 'Dates do not match') throw error;
            else throw new Error('Error at request getTodayPosition to NapoleonX.\nCheck that your username and password are correct.\nIf they are then check you have at least one token checked in NapoleonX Platform.\n' + error);
         }
    }

    checkTodayDate(response) {
        const nextNapoPosition = response.data.data.next_position_date.slice(0, 10);
        const today = new Date();
        today.setDate(today.getDate() + 1)
        const tomorrow = today.toISOString().slice(0, 10);
        if (nextNapoPosition === tomorrow) return true;
        else return false;
    }

}

module.exports = NapoleonBot;

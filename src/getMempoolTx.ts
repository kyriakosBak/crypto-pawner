var Web3 = require('web3')
var url = "http://localhost:8545"

var options = {
    timeout: 30000,
    clientConfig: {
        maxReceivedFrameSize: 100000000,
        maxReceivedMessageSize: 100000000,
    },
    reconnect: {
        auto: true,
        delay: 5000,
        maxAttempts: 15,
        onTimeout: false,
    },
};


var web3 = new Web3(new Web3.default.providers.WebsocketProvider(url, options))
const subscription = web3.eth.subscribe("pendingTransactions", (err: any, res: any) => {
    if (err) console.error(err);
});

var init = function () {
    subscription.on("data", (txHash: any) => {
        setTimeout(async () => {
            try {
                let tx = await web3.eth.getTransaction(txHash);
                console.log(tx)
            } catch (err) {
                console.error(err);
            }
        });
    });
};

init();
import Web3 from 'web3'
var url = "ws://localhost:8545"

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

const web3 = new Web3(url)
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
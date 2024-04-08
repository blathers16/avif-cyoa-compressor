

class WorkerPool {
    private pool: { [key: number]: { status: boolean; worker: Worker } } = {};
    private poolIds: number[] = [];
    worker: string = '';
    numberOfWorkers: number = 1;

    constructor(worker: string, numberOfWorkers: number) {
        this.worker = './compressor.worker.ts';
        this.numberOfWorkers = numberOfWorkers;

        for (let i = 0; i < this.numberOfWorkers; i++) {
            this.poolIds.push(i);
            const myWorker = new Worker(worker);

            myWorker.addEventListener('message', (e) => {
                const data = e.data;
                console.log(`Worker #${i} finished. status: ${data.status}`);
                this.pool[i].status = true;
                this.poolIds.push(i);
            });

            this.pool[i] = { status: true, worker: myWorker };
        }
    }

    getFreeWorkerId(callback: (workerId: number) => void): void {
        if (this.poolIds.length > 0) {
            callback(this.poolIds.pop()!);
        } else {
            setTimeout(() => {
                this.getFreeWorkerId(callback);
            }, 100);
        }
    }

    postMessage(data: any): void {
        this.getFreeWorkerId((workerId) => {
            this.pool[workerId].status = false;
            const worker = this.pool[workerId].worker;
            console.log(`postMessage with worker #${workerId}`);
            worker.postMessage(data);
        });
    }

    registerOnMessage(callback: (e: MessageEvent) => void): void {
        for (let i = 0; i < this.numberOfWorkers; i++) {
            this.pool[i].worker.addEventListener('message', callback);
        }
    }

    getFreeIds(): number[] {
        return this.poolIds;
    }
}

export default WorkerPool
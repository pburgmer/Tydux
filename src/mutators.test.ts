import {assert} from "chai";
import {enableTyduxDevelopmentMode} from "./development";
import {resetTydux} from "./global-state";
import {Mutators} from "./mutators";
import {Store} from "./Store";
import {collect} from "./test-utils";


export class EmptyMutators extends Mutators<any> {
}

describe("Mutators", function () {

    beforeEach(() => enableTyduxDevelopmentMode());

    afterEach(() => resetTydux());

    it("methods can change the state", function () {
        class TestMutator extends Mutators<{ n1: number }> {
            mut1() {
                this.state.n1 = 1;
            }
        }

        class MyStore extends Store<TestMutator, { n1: number }> {
            action() {
                this.mutate.mut1();
            }
        }

        const store = new MyStore("", new TestMutator(), {n1: 0});
        store.action();
        assert.deepEqual(store.state, {n1: 1});
    });

    it("methods can assign a new state", function () {
        class TestMutator extends Mutators<{ n1: number }> {
            mut1() {
                this.state = {
                    n1: 1
                };
            }
        }

        class MyStore extends Store<TestMutator, { n1: number }> {
            action() {
                this.mutate.mut1();
            }
        }

        const store = new MyStore("", new TestMutator(), {n1: 0});
        store.action();
        assert.deepEqual(store.state, {n1: 1});
    });

    it("can change the state deeply", function () {
        class TestMutator extends Mutators<{ n1: number[] }> {
            mut1() {
                this.state.n1.push(3);
            }
        }

        class MyStore extends Store<TestMutator, { n1: number[] }> {
            action() {
                this.mutate.mut1();
            }
        }

        const store = new MyStore("", new TestMutator(), {n1: [1, 2]});
        store.action();
        assert.deepEqual(store.state.n1, [1, 2, 3]);
    });

    it("nested methods are merged", function () {
        class TestMutator extends Mutators<{ n1: string }> {
            mod1() {
                this.state.n1 += "1";
                this.mod2();
                this.mod3();
            }

            mod2() {
                this.state.n1 += "2";
            }

            mod3() {
                this.state.n1 += "3";
            }
        }

        class TestStore extends Store<TestMutator, { n1: string }> {
            action1() {
                this.mutate.mod1();
            }
        }

        const store = new TestStore("TestStore", new TestMutator(), {n1: ""});
        let collected = collect(store.select(s => s.n1).asObservable());
        store.action1();
        collected.assert("", "123");
    });

    it("state changes are only persistent if the mutator did not throw an exception", function () {
        class TestMutator extends Mutators<any> {
            mut1() {
                this.state.a = 1;
                if (this.state.a > 0) {
                    throw new Error("");
                }
                this.state.a = 2;
            }
        }

        class MyStore extends Store<TestMutator, { a: number }> {
            action() {
                this.mutate.mut1();
            }
        }

        const store = new MyStore("", new TestMutator(), {a: 0});
        assert.throws(() => store.action());
        assert.equal(store.state.a, 0);
    });

    it("mutators must not have instance members", function () {
        class MyMutators extends Mutators<any> {
            // noinspection JSUnusedGlobalSymbols
            abc = 1;
        }

        class MyStore extends Store<MyMutators, any> {
        }

        assert.throws(
            () => new MyStore("myStore", new MyMutators(), {}),
            /abc/
        );
    });

    it("mutators must not create instance members", function () {
        class MyMutators extends Mutators<any> {

            mut() {
                (this as any).abc = 1;
            }

        }

        class MyStore extends Store<MyMutators, any> {
            action() {
                assert.throws(() => this.mutate.mut(), /abc/);
            }
        }

        const store = new MyStore("myStore", new MyMutators(), {});
        store.action();
    });

});

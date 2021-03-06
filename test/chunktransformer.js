/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon').sandbox.create();
const Mutation = require('../src/mutation.js');
const ROW_ID = 'my-row';
const CONVERTED_ROW_ID = 'my-converted-row';
const RowStateEnum = require('../src/chunktransformer.js').RowStateEnum;

const FakeMutation = {
  methods: Mutation.methods,
  convertToBytes: sinon.spy(function(value) {
    if (value === ROW_ID) {
      return CONVERTED_ROW_ID;
    }
    return value;
  }),
  convertFromBytes: sinon.spy(function(value) {
    return value;
  }),
};

describe('Bigtable/ChunkTransformer', function() {
  var ChunkTransformer;
  var chunkTransformer;
  var rows;
  before(function() {
    ChunkTransformer = proxyquire('../src/chunktransformer.js', {
      './mutation.js': FakeMutation,
    });
  });
  beforeEach(function() {
    chunkTransformer = new ChunkTransformer();
    rows = [];
    chunkTransformer.push = function(row) {
      rows.push(row);
    };
  });
  afterEach(function() {
    sinon.restore();
  });
  describe('instantiation', function() {
    it('should have initial state', function() {
      assert(chunkTransformer instanceof ChunkTransformer);
      this.prevRowKey = '';
      this.family = {};
      this.qualifiers = [];
      this.qualifier = {};
      this.row = {};
      this.state = RowStateEnum.NEW_ROW;
      assert.deepEqual(chunkTransformer.row, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.prevRowKey,
        '',
        'invalid initial state'
      );
      assert.deepEqual(chunkTransformer.family, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.qualifiers,
        [],
        'invalid initial state'
      );
      assert.deepEqual(chunkTransformer.qualifier, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'invalid initial state'
      );
    });
    it('calling as function should return chunkTransformer instance', function() {
      const instance = ChunkTransformer();
      assert(instance instanceof ChunkTransformer);
    });
  });
  describe('processNewRow', function() {
    var processNewRowSpy;
    var resetSpy;
    var commitSpy;
    var destroySpy;
    beforeEach(function() {
      processNewRowSpy = sinon.spy(chunkTransformer, 'processNewRow');
      resetSpy = sinon.spy(chunkTransformer, 'reset');
      commitSpy = sinon.spy(chunkTransformer, 'commit');
      destroySpy = sinon.spy(chunkTransformer, 'destroy');
    });
    it('should destroy when row key is defined ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      chunkTransformer.row = {key: 'abc'};
      processNewRowSpy.call(chunkTransformer, {});
    });
    it('should destroy when chunk key is undefined ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processNewRowSpy.call(chunkTransformer, {});
    });
    it('should destroy when resetRow is true ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processNewRowSpy.call(chunkTransformer, {
        rowKey: 'key',
        resetRow: true,
      });
    });
    it('should destroy when resetRow ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processNewRowSpy.call(chunkTransformer, {resetRow: true});
    });
    it('should destroy when row key is equal to previous row key ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      chunkTransformer.prevRowKey = 'key';

      processNewRowSpy.call(chunkTransformer, {
        rowKey: 'key',
        resetRow: false,
      });
    });
    it('should destroy when family name is undefined ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processNewRowSpy.call(chunkTransformer, {rowKey: 'key'});
    });
    it('should destroy when qualifier is undefined ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processNewRowSpy.call(chunkTransformer, {
        rowKey: 'key',
        familyName: 'family',
      });
    });
    it('should destroy when valueSize>0 and commitRow=true ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processNewRowSpy.call(chunkTransformer, {
        rowKey: 'key',
        familyName: 'family',
        qualifier: 'qualifier',
        valueSize: 10,
        commitRow: true,
      });
    });
    it('should commit 1 row ', function() {
      const chunk = {
        rowKey: 'key',
        familyName: {value: 'family'},
        qualifier: {value: 'qualifier'},
        valueSize: 0,
        timestampMicros: 0,
        labels: [],
        commitRow: true,
        value: 'value',
      };
      chunkTransformer.processNewRow(chunk);
      assert(resetSpy.called, 'reset state failed');
      assert(commitSpy.called, 'commit row failed');
      assert.equal(
        chunkTransformer.prevRowKey,
        chunk.rowKey,
        'wrong state prevrowkey'
      );
      let expectedRow = {
        key: chunk.rowKey,
        data: {
          family: {
            qualifier: [
              {
                value: chunk.value,
                timestamp: chunk.timestampMicros,
                labels: chunk.labels,
              },
            ],
          },
        },
      };
      assert.deepEqual(rows[0], expectedRow);
    });
    it('partial row  ', function() {
      const chunk = {
        rowKey: 'key',
        familyName: {value: 'family'},
        qualifier: {value: 'qualifier'},
        valueSize: 0,
        timestampMicros: 0,
        labels: [],
        commitRow: false,
        value: 'value',
      };
      chunkTransformer.processNewRow(chunk);
      assert(!resetSpy.called, 'invalid call to reset');
      assert(!commitSpy.called, 'inavlid call to commit');
      assert.equal(rows.length, 0, 'wrong call to push');
      let partialRow = {
        key: chunk.rowKey,
        data: {
          family: {
            qualifier: [
              {
                value: chunk.value,
                timestamp: chunk.timestampMicros,
                labels: chunk.labels,
              },
            ],
          },
        },
      };
      assert.deepEqual(chunkTransformer.row, partialRow);
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.ROW_IN_PROGRESS,
        'wrong state'
      );
    });
    it('partial cell  ', function() {
      const chunk = {
        rowKey: 'key',
        familyName: {value: 'family'},
        qualifier: {value: 'qualifier'},
        valueSize: 10,
        timestampMicros: 0,
        labels: [],
        commitRow: false,
        value: 'value',
      };
      chunkTransformer.processNewRow(chunk);
      assert(!resetSpy.called, 'invalid call to reset');
      assert(!commitSpy.called, 'inavlid call to commit');
      assert.equal(rows.length, 0, 'wrong call to push');
      let partialRow = {
        key: chunk.rowKey,
        data: {
          family: {
            qualifier: [
              {
                value: chunk.value,
                timestamp: chunk.timestampMicros,
                labels: chunk.labels,
              },
            ],
          },
        },
      };
      assert.deepEqual(chunkTransformer.row, partialRow);
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.CELL_IN_PROGRESS,
        'wrong state'
      );
    });
  });
  describe('processRowInProgress', function() {
    var processRowInProgressSpy;
    var resetSpy;
    var commitSpy;
    var destroySpy;
    beforeEach(function() {
      processRowInProgressSpy = sinon.spy(
        chunkTransformer,
        'processRowInProgress'
      );
      resetSpy = sinon.spy(chunkTransformer, 'reset');
      commitSpy = sinon.spy(chunkTransformer, 'commit');
      destroySpy = sinon.spy(chunkTransformer, 'destroy');
    });
    it('should destroy when resetRow and rowkey', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        rowKey: 'key',
      });
    });
    it('should destroy when resetRow and familyName', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        familyName: 'family',
      });
    });
    it('should destroy when resetRow and qualifier', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        qualifier: 'qualifier',
      });
    });
    it('should destroy when resetRow and value', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        value: 'value',
      });
    });
    it('should destroy when resetRow and timestampMicros', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        timestampMicros: 10,
      });
    });
    it('should destroy when rowKey not equal to prevRowKey', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      chunkTransformer.row = {key: 'key1'};
      processRowInProgressSpy.call(chunkTransformer, {rowKey: 'key'});
    });
    it('should destroy when valueSize>0 and commitRow=true ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        valueSize: 10,
        commitRow: true,
      });
    });
    it('should destroy when familyName without qualifier ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processRowInProgressSpy.call(chunkTransformer, {
        familyName: 'family',
      });
    });
    it('should reset on resetRow ', function() {
      const chunk = {resetRow: true};
      chunkTransformer.processRowInProgress(chunk);
      assert(resetSpy.called, 'Did not reset');
      assert.equal(rows.length, 0, 'wrong call to push');
      assert(!commitSpy.called, 'unexpected commit');
    });
    it('bare commitRow should produce qualifer ', function() {
      chunkTransformer.qualifiers = [];
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: {
            qualifier: chunkTransformer.qualifiers,
          },
        },
      };
      const chunk = {commitRow: true};
      chunkTransformer.processRowInProgress(chunk);
      assert(commitSpy.called, 'did not call commit');
      assert(resetSpy.called, 'did not call reset');
      assert.equal(rows.length, 1, 'wrong call to push');
      const expectedRow = {
        key: 'key',
        data: {
          family: {
            qualifier: [
              {
                value: undefined,
                timestamp: undefined,
                labels: undefined,
              },
            ],
          },
        },
      };
      const row = rows[0];
      assert.deepEqual(row, expectedRow, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'state mismatch'
      );
    });
    it('chunk with qualifier and commit should produce row ', function() {
      chunkTransformer.qualifiers = [];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      const chunk = {
        commitRow: true,
        qualifier: {value: 'qualifier2'},
        value: 'value',
        timestampMicros: 0,
        labels: [],
        valueSize: 0,
      };
      chunkTransformer.processRowInProgress(chunk);
      assert(commitSpy.called, 'did not call commit');
      assert(resetSpy.called, 'did not call reset');
      assert.equal(rows.length, 1, 'wrong call to push');
      const expectedRow = {
        key: 'key',
        data: {
          family: {
            qualifier: [],
            qualifier2: [
              {
                value: 'value',
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      const row = rows[0];
      assert.deepEqual(row, expectedRow, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'state mismatch'
      );
    });
    it('chunk with new family and commitRow should produce row', function() {
      chunkTransformer.qualifiers = [];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      const chunk = {
        commitRow: true,
        familyName: {value: 'family2'},
        qualifier: {value: 'qualifier2'},
        value: 'value',
        timestampMicros: 0,
        labels: [],
        valueSize: 0,
      };
      chunkTransformer.processRowInProgress(chunk);
      assert(commitSpy.called, 'did not call commit');
      assert(resetSpy.called, 'did not call reset');
      assert.equal(rows.length, 1, 'wrong call to push');
      const expectedRow = {
        key: 'key',
        data: {
          family: {
            qualifier: [],
          },
          family2: {
            qualifier2: [
              {
                value: 'value',
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      const row = rows[0];
      assert.deepEqual(row, expectedRow, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'state mismatch'
      );
    });
    it('partial cell ', function() {
      chunkTransformer.qualifiers = [];
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: {
            qualifier: chunkTransformer.qualifiers,
          },
        },
      };
      const chunk = {
        commitRow: false,
        value: 'value2',
        valueSize: 10,
        timestampMicros: 0,
        labels: [],
      };
      chunkTransformer.processRowInProgress(chunk);
      assert(!commitSpy.called, 'invalid call to commit');
      assert(!resetSpy.called, 'invalid call to reset');
      assert.equal(rows.length, 0, 'wrong call to push');
      const expectedState = {
        key: 'key',
        data: {
          family: {
            qualifier: [
              {
                value: 'value2',
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      assert.deepEqual(
        chunkTransformer.row,
        expectedState,
        'row state mismatch'
      );
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.CELL_IN_PROGRESS,
        'state mismatch'
      );
    });
  });
  describe('processCellInProgress', function() {
    var processCellInProgressSpy;
    var resetSpy;
    var commitSpy;
    var destroySpy;
    beforeEach(function() {
      processCellInProgressSpy = sinon.spy(
        chunkTransformer,
        'processCellInProgress'
      );
      resetSpy = sinon.spy(chunkTransformer, 'reset');
      commitSpy = sinon.spy(chunkTransformer, 'commit');
      destroySpy = sinon.spy(chunkTransformer, 'destroy');
    });
    it('should destroy when resetRow and rowkey', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processCellInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        rowKey: 'key',
      });
    });
    it('should destroy when resetRow and familyName', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processCellInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        familyName: 'family',
      });
    });
    it('should destroy when resetRow and qualifier', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processCellInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        qualifier: 'qualifier',
      });
    });
    it('should destroy when resetRow and value', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processCellInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        value: 'value',
      });
    });
    it('should destroy when resetRow and timestampMicros', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processCellInProgressSpy.call(chunkTransformer, {
        resetRow: true,
        timestampMicros: 10,
      });
    });
    it('should destroy when valueSize>0 and commitRow=true ', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called);
        done();
      });
      processCellInProgressSpy.call(chunkTransformer, {
        valueSize: 10,
        commitRow: true,
      });
    });
    it('should reset on resetRow ', function() {
      const chunk = {resetRow: true};
      chunkTransformer.processCellInProgress(chunk);
      assert(resetSpy.called, 'did not call reset');
      assert(!commitSpy.called, 'unexpected call to commit');
      assert.equal(rows.length, 0, 'wrong call to push');
    });
    it('should produce row on commitRow', function() {
      chunkTransformer.qualifier = {
        value: 'value',
        size: 0,
        timestamp: 0,
        labels: [],
      };
      chunkTransformer.qualifiers = [chunkTransformer.qualifier];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      const chunk = {
        commitRow: true,
        value: '2',
        valueSize: 0,
      };
      chunkTransformer.processCellInProgress(chunk);
      assert(commitSpy.called, 'did not call commit');
      assert(resetSpy.called, 'did not call reste');
      assert.equal(rows.length, 1, 'wrong call to push');
      const expectedRow = {
        key: 'key',
        data: {
          family: {
            qualifier: [
              {
                value: 'value2',
                size: 0,
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      const row = rows[0];
      assert.deepEqual(row, expectedRow, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'state mismatch'
      );
    });
    it('without commitRow should change state to processRowInProgress', function() {
      chunkTransformer.qualifier = {
        value: 'value',
        size: 0,
        timestamp: 0,
        labels: [],
      };
      chunkTransformer.qualifiers = [chunkTransformer.qualifier];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      const chunk = {
        commitRow: false,
        value: '2',
        valueSize: 0,
      };
      chunkTransformer.processCellInProgress(chunk);
      assert(!resetSpy.called, 'invalid call to reset');
      assert(!commitSpy.called, 'invalid call to commit');
      assert.equal(rows.length, 0, 'wrong call to push');
      const expectedState = {
        key: 'key',
        data: {
          family: {
            qualifier: [
              {
                value: 'value2',
                size: 0,
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      assert.deepEqual(chunkTransformer.row, expectedState, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.ROW_IN_PROGRESS,
        'state mismatch'
      );
    });
    it('should concat buffer when decode option is false', function() {
      chunkTransformer = new ChunkTransformer({decode: false});
      processCellInProgressSpy = sinon.spy(
        chunkTransformer,
        'processCellInProgress'
      );
      resetSpy = sinon.spy(chunkTransformer, 'reset');
      commitSpy = sinon.spy(chunkTransformer, 'commit');
      destroySpy = sinon.spy(chunkTransformer, 'destroy');
      chunkTransformer.qualifier = {
        value: Buffer.from('value'.toString('base64'), 'base64'),
        size: 0,
        timestamp: 0,
        labels: [],
      };
      chunkTransformer.qualifiers = [chunkTransformer.qualifier];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      const chunk = {
        commitRow: false,
        value: Buffer.from('value'.toString('base64'), 'base64'),
        valueSize: 0,
      };
      chunkTransformer.processCellInProgress(chunk);
      assert(!resetSpy.called, 'invalid call to reset');
      assert(!commitSpy.called, 'invalid call to commit');
      assert.equal(rows.length, 0, 'wrong call to push');
      const expectedState = {
        key: 'key',
        data: {
          family: {
            qualifier: [
              {
                value: Buffer.concat([
                  Buffer.from('value'.toString('base64'), 'base64'),
                  Buffer.from('value'.toString('base64'), 'base64'),
                ]),
                size: 0,
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      assert.deepEqual(chunkTransformer.row, expectedState, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.ROW_IN_PROGRESS,
        'state mismatch'
      );
    });
  });
  describe('_flush', function() {
    var _flushSpy;
    var callback;
    var destroySpy;
    beforeEach(function() {
      _flushSpy = sinon.spy(chunkTransformer, '_flush');
      callback = sinon.spy();
      destroySpy = sinon.spy(chunkTransformer, 'destroy');
    });
    it('completed row should complete successfully', function() {
      chunkTransformer.row = {};
      _flushSpy.call(chunkTransformer, callback);
      assert(callback.called, 'did not call callback');
      const err = callback.getCall(0).args[0];
      assert(!err, 'did not expect error');
    });
    it('should call destroy when there is uncommitted row', function(done) {
      chunkTransformer.on('error', function() {
        assert(destroySpy.called, 'did not destroyed');
        done();
      });
      chunkTransformer.row = {key: 'abc'};
      _flushSpy.call(chunkTransformer, callback);
    });
  });
  describe('_transform', function() {
    var callback;
    var processNewRowSpy;
    var processRowInProgressSpy;
    var processCellInProgressSpy;
    beforeEach(function() {
      callback = sinon.spy();
      processNewRowSpy = sinon.spy(chunkTransformer, 'processNewRow');
      processRowInProgressSpy = sinon.spy(
        chunkTransformer,
        'processRowInProgress'
      );
      processCellInProgressSpy = sinon.spy(
        chunkTransformer,
        'processCellInProgress'
      );
    });
    it('when current state is NEW_ROW should call processNewRow', function() {
      const chunk = {
        rowKey: 'key',
        familyName: {value: 'family'},
        qualifier: {value: 'qualifier'},
        valueSize: 0,
        timestampMicros: 0,
        labels: [],
        commitRow: true,
        value: 'value',
      };
      chunkTransformer.state = RowStateEnum.NEW_ROW;
      const chunks = [chunk];
      chunkTransformer._transform({chunks: chunks}, {}, callback);
      assert(processNewRowSpy.called, 'did not call processNewRow');
      const err = callback.getCall(0).args[0];
      assert(!err, 'did not expect error');
    });
    it('when current state is ROW_IN_PROGRESS should call processRowInProgress', function() {
      chunkTransformer.row = {key: 'key'};
      chunkTransformer.state = RowStateEnum.ROW_IN_PROGRESS;
      const chunks = [{key: 'key'}];
      chunkTransformer._transform({chunks: chunks}, {}, callback);
      assert(
        processRowInProgressSpy.called,
        'did not call processRowInProgress'
      );
      const err = callback.getCall(0).args[0];
      assert(!err, 'did not expect error');
    });
    it('when current state is CELL_IN_PROGRESS should call processCellInProgress', function() {
      chunkTransformer.row = {key: 'key'};
      chunkTransformer.state = RowStateEnum.CELL_IN_PROGRESS;
      const chunks = [{key: 'key'}];
      chunkTransformer._transform({chunks: chunks}, {}, callback);
      assert(
        processCellInProgressSpy.called,
        'did not call processCellInProgress'
      );
      const err = callback.getCall(0).args[0];
      assert(!err, 'did not expect error');
    });
    it('should return when stream is destroyed', function() {
      chunkTransformer._destroyed = true;
      const chunks = [{key: 'key'}];
      chunkTransformer._transform({chunks: chunks}, {}, callback);
      assert(!callback.called, 'unexpected call to  next');
    });
    it('should change the `lastRowKey` value for `data.lastScannedRowKey`', function() {
      chunkTransformer._transform(
        {chunks: [], lastScannedRowKey: 'foo'},
        {},
        callback
      );
      assert.deepEqual(chunkTransformer.lastRowKey, 'foo');
    });
  });
  describe('reset', function() {
    it('should reset initial state', function() {
      chunkTransformer.prevRowKey = 'prevkey';
      chunkTransformer.qualifier = {
        value: 'value',
        size: 0,
        timestamp: 0,
        labels: [],
      };
      chunkTransformer.qualifiers = [chunkTransformer.qualifier];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      this.state = RowStateEnum.CELL_IN_PROGRESS;
      chunkTransformer.reset();
      assert.deepEqual(chunkTransformer.row, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.prevRowKey,
        '',
        'invalid initial state'
      );
      assert.deepEqual(chunkTransformer.family, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.qualifiers,
        [],
        'invalid initial state'
      );
      assert.deepEqual(chunkTransformer.qualifier, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'invalid initial state'
      );
    });
  });
  describe('commit', function() {
    var resetSpy;
    beforeEach(function() {
      resetSpy = sinon.spy(chunkTransformer, 'reset');
    });
    it('should reset to initial state and set prevRowKey', function() {
      chunkTransformer.prevRowKey = '';
      chunkTransformer.qualifier = {
        value: 'value',
        size: 0,
        timestamp: 0,
        labels: [],
      };
      chunkTransformer.qualifiers = [chunkTransformer.qualifier];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      this.state = RowStateEnum.CELL_IN_PROGRESS;
      chunkTransformer.commit();
      assert(resetSpy.called, 'did not call reset');
      assert.deepEqual(chunkTransformer.row, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.prevRowKey,
        'key',
        'invalid initial state'
      );
      assert.deepEqual(chunkTransformer.family, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.qualifiers,
        [],
        'invalid initial state'
      );
      assert.deepEqual(chunkTransformer.qualifier, {}, 'invalid initial state');
      assert.deepEqual(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'invalid initial state'
      );
    });
  });
  describe('moveToNextState', function() {
    var commitSpy;
    beforeEach(function() {
      commitSpy = sinon.spy(chunkTransformer, 'commit');
    });
    it('chunk with commit row should call callback with row and call commit state', function() {
      chunkTransformer.qualifier = {
        value: 'value',
        size: 0,
        timestamp: 0,
        labels: [],
      };
      chunkTransformer.qualifiers = [chunkTransformer.qualifier];
      chunkTransformer.family = {
        qualifier: chunkTransformer.qualifiers,
      };
      chunkTransformer.row = {
        key: 'key',
        data: {
          family: chunkTransformer.family,
        },
      };
      const chunk = {
        commitRow: true,
      };
      chunkTransformer.moveToNextState(chunk);
      assert(commitSpy.called, 'did not call commit');
      assert.equal(rows.length, 1, 'did not call push');
      const expectedRow = {
        key: 'key',
        data: {
          family: {
            qualifier: [
              {
                value: 'value',
                size: 0,
                timestamp: 0,
                labels: [],
              },
            ],
          },
        },
      };
      const row = rows[0];
      assert.deepEqual(row, expectedRow, 'row mismatch');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.NEW_ROW,
        'state mismatch'
      );
    });
    it('chunk without commitRow and value size>0 should move to CELL_IN_PROGRESS', function() {
      const chunk = {
        commitRow: false,
        valueSize: 10,
      };
      chunkTransformer.state = RowStateEnum.NEW_ROW;
      chunkTransformer.moveToNextState(chunk);
      assert(!commitSpy.called, 'did not call commit');
      assert.equal(rows.length, 0, 'unexpected call to push');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.CELL_IN_PROGRESS,
        'wrong state'
      );
    });
    it('chunk without commitRow and value size==0 should move to ROW_IN_PROGRESS', function() {
      const chunk = {
        commitRow: false,
        valueSize: 0,
      };
      chunkTransformer.state = RowStateEnum.CELL_IN_PROGRESS;
      chunkTransformer.moveToNextState(chunk);
      assert(!commitSpy.called, 'did not call commit');
      assert.equal(rows.length, 0, 'unexpected call to push');
      assert.equal(
        chunkTransformer.state,
        RowStateEnum.ROW_IN_PROGRESS,
        'wrong state'
      );
    });
  });
  describe('destroy', function() {
    it('should emit error when destroy is called with error', function(done) {
      const error = new Error('destroy error');
      chunkTransformer.on('error', function(err) {
        assert.equal(err, error, 'did not emit error');
        done();
      });
      chunkTransformer.destroy(error);
    });
    it('should not emit if transform is already destroyed', function(done) {
      chunkTransformer.on('close', function() {
        done();
      });
      chunkTransformer.destroy();
      chunkTransformer.destroy();
    });
  });
});

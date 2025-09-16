/**
 * Contract Tests: Real-time Collaboration WebSocket API
 * WebSocket /ws/projects/{id}
 *
 * These tests verify that the WebSocket API contract matches the specification
 * defined in specs/001-collabcut-is-a/contracts/collaboration-websocket.md
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Mock WebSocket server - This doesn't exist yet, hence tests will fail (RED phase)
const WS_URL = process.env.WS_URL || 'ws://localhost:8080'; // This will fail until implemented

describe('Real-time Collaboration WebSocket API', () => {
  describe('Contract: WebSocket Connection', () => {
    const validProjectId = uuidv4();
    const validToken = 'valid-jwt-token';
    const invalidToken = 'invalid-token';

    let ws;

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should establish connection with valid authentication', (done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        done();
      });

      ws.on('error', (error) => {
        done(new Error(`Connection failed: ${error.message}`));
      });

      // Set timeout to prevent hanging tests
      setTimeout(() => {
        done(new Error('Connection timeout'));
      }, 5000);
    });

    it('should reject connection with invalid authentication', (done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${invalidToken}`;
      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });

      ws.on('error', (error) => {
        // Expected error for invalid authentication
        expect(error).toBeDefined();
        done();
      });

      ws.on('close', (code) => {
        // Expecting close code for authentication failure
        expect([1008, 1011]).toContain(code); // Unauthorized or Internal Server Error
        done();
      });
    });

    it('should reject connection with malformed project ID', (done) => {
      const wsUrl = `${WS_URL}/ws/projects/invalid-uuid?token=${validToken}`;
      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });

      ws.on('error', () => {
        done(); // Expected error
      });

      ws.on('close', (code) => {
        expect(code).toBe(1003); // Unsupported Data
        done();
      });
    });
  });

  describe('Contract: Message Format Validation', () => {
    const validProjectId = uuidv4();
    const validToken = 'valid-jwt-token';
    let ws;

    beforeEach((done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      ws = new WebSocket(wsUrl);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should validate message structure requirements', (done) => {
      const validMessage = {
        type: 'join_project',
        data: {
          project_id: validProjectId,
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(validMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        // Verify response has required message structure
        expect(response).toHaveProperty('type');
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('timestamp');
        expect(response).toHaveProperty('user_id');

        // Verify timestamp is ISO 8601 format
        expect(response.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
        );

        // Verify user_id is UUID format
        expect(response.user_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        done();
      });
    });

    it('should reject message with missing type field', (done) => {
      const invalidMessage = {
        data: { project_id: validProjectId },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
      };

      ws.send(JSON.stringify(invalidMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        expect(response.type).toBe('error');
        expect(response.data).toHaveProperty('code');
        expect(response.data).toHaveProperty('message');
        expect(response.data.message).toContain('type');

        done();
      });
    });

    it('should reject message with missing data field', (done) => {
      const invalidMessage = {
        type: 'join_project',
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
      };

      ws.send(JSON.stringify(invalidMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        expect(response.type).toBe('error');
        expect(response.data.message).toContain('data');

        done();
      });
    });
  });

  describe('Contract: Join Project Operation', () => {
    const validProjectId = uuidv4();
    const validSequenceId = uuidv4();
    const validToken = 'valid-jwt-token';
    let ws;

    beforeEach((done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      ws = new WebSocket(wsUrl);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle join_project message and return project_joined', (done) => {
      const joinMessage = {
        type: 'join_project',
        data: {
          project_id: validProjectId,
          sequence_id: validSequenceId,
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(joinMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (response.type === 'project_joined') {
          // Verify project_joined response structure
          expect(response.data).toHaveProperty('project_id', validProjectId);
          expect(response.data).toHaveProperty('active_users');
          expect(Array.isArray(response.data.active_users)).toBe(true);

          // Verify active user structure
          if (response.data.active_users.length > 0) {
            const user = response.data.active_users[0];
            expect(user).toHaveProperty('user_id');
            expect(user).toHaveProperty('username');
            expect(user).toHaveProperty('display_name');
            expect(user).toHaveProperty('status');
            expect(user).toHaveProperty('cursor');

            // Verify cursor structure
            expect(user.cursor).toHaveProperty('sequence_id');
            expect(user.cursor).toHaveProperty('position');
            expect(user.cursor).toHaveProperty('color');

            expect(typeof user.cursor.position).toBe('number');
            expect(typeof user.cursor.color).toBe('string');
          }

          done();
        }
      });
    });

    it('should return error for join_project with invalid project_id', (done) => {
      const joinMessage = {
        type: 'join_project',
        data: {
          project_id: 'invalid-uuid',
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(joinMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        expect(response.type).toBe('error');
        expect(response.data).toHaveProperty('code');
        expect(response.data).toHaveProperty('message');

        done();
      });
    });
  });

  describe('Contract: Cursor Update Operations', () => {
    const validProjectId = uuidv4();
    const validSequenceId = uuidv4();
    const validToken = 'valid-jwt-token';
    let ws;

    beforeEach((done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      ws = new WebSocket(wsUrl);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle cursor_update message and broadcast cursor_moved', (done) => {
      const cursorMessage = {
        type: 'cursor_update',
        data: {
          sequence_id: validSequenceId,
          position: 45.5,
          activity_type: 'editing',
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(cursorMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (response.type === 'cursor_moved') {
          // Verify cursor_moved response structure
          expect(response.data).toHaveProperty('user_id');
          expect(response.data).toHaveProperty('sequence_id', validSequenceId);
          expect(response.data).toHaveProperty('position', 45.5);
          expect(response.data).toHaveProperty('activity_type', 'editing');
          expect(response.data).toHaveProperty('color');

          expect(typeof response.data.color).toBe('string');
          expect(response.data.color).toMatch(/^#[0-9a-f]{6}$/i);

          done();
        }
      });
    });

    it('should validate activity_type values', (done) => {
      const validActivityTypes = ['editing', 'viewing', 'selecting'];
      let testIndex = 0;

      function testActivityType() {
        if (testIndex >= validActivityTypes.length) {
          done();
          return;
        }

        const cursorMessage = {
          type: 'cursor_update',
          data: {
            sequence_id: validSequenceId,
            position: 10.0,
            activity_type: validActivityTypes[testIndex],
          },
          timestamp: new Date().toISOString(),
          user_id: uuidv4(),
          message_id: uuidv4(),
        };

        ws.send(JSON.stringify(cursorMessage));

        const messageHandler = (data) => {
          const response = JSON.parse(data.toString());

          if (response.type === 'cursor_moved') {
            expect(response.data.activity_type).toBe(
              validActivityTypes[testIndex]
            );
            testIndex++;
            ws.off('message', messageHandler);
            setTimeout(testActivityType, 100);
          }
        };

        ws.on('message', messageHandler);
      }

      testActivityType();
    });
  });

  describe('Contract: Timeline Operations', () => {
    const validProjectId = uuidv4();
    const validSequenceId = uuidv4();
    const validTrackId = uuidv4();
    const validClipId = uuidv4();
    const validToken = 'valid-jwt-token';
    let ws;

    beforeEach((done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      ws = new WebSocket(wsUrl);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle timeline_operation message for add_clip', (done) => {
      const timelineMessage = {
        type: 'timeline_operation',
        data: {
          operation: 'add_clip',
          sequence_id: validSequenceId,
          track_id: validTrackId,
          properties: {
            media_asset_id: uuidv4(),
            start_time: 10.0,
            end_time: 20.0,
            media_in: 5.0,
            media_out: 15.0,
          },
          timestamp: new Date().toISOString(),
          operation_id: uuidv4(),
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(timelineMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (response.type === 'timeline_updated') {
          // Verify timeline_updated response structure
          expect(response.data).toHaveProperty('operation', 'add_clip');
          expect(response.data).toHaveProperty('sequence_id', validSequenceId);
          expect(response.data).toHaveProperty('user_id');
          expect(response.data).toHaveProperty('username');
          expect(response.data).toHaveProperty('clip_data');
          expect(response.data).toHaveProperty('operation_id');
          expect(response.data).toHaveProperty('timestamp');

          // Verify clip_data structure
          expect(response.data.clip_data).toHaveProperty('id');
          expect(response.data.clip_data).toHaveProperty(
            'track_id',
            validTrackId
          );
          expect(response.data.clip_data).toHaveProperty('start_time', 10.0);
          expect(response.data.clip_data).toHaveProperty('end_time', 20.0);

          done();
        }
      });
    });

    it('should validate timeline operation types', (done) => {
      const validOperations = [
        'add_clip',
        'move_clip',
        'delete_clip',
        'update_clip',
      ];
      const invalidOperation = 'invalid_operation';

      const timelineMessage = {
        type: 'timeline_operation',
        data: {
          operation: invalidOperation,
          sequence_id: validSequenceId,
          track_id: validTrackId,
          properties: {},
          timestamp: new Date().toISOString(),
          operation_id: uuidv4(),
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(timelineMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        expect(response.type).toBe('error');
        expect(response.data.message).toContain('operation');

        done();
      });
    });
  });

  describe('Contract: Chat and Comments', () => {
    const validProjectId = uuidv4();
    const validSequenceId = uuidv4();
    const validClipId = uuidv4();
    const validToken = 'valid-jwt-token';
    let ws;

    beforeEach((done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      ws = new WebSocket(wsUrl);
      ws.on('open', () => done());
      ws.on('error', done);
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle add_comment message', (done) => {
      const commentMessage = {
        type: 'add_comment',
        data: {
          content: 'This clip needs adjustment',
          timestamp: 15.5,
          clip_id: validClipId,
          sequence_id: validSequenceId,
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(commentMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (response.type === 'comment_added') {
          // Verify comment_added response structure
          expect(response.data).toHaveProperty('comment_id');
          expect(response.data).toHaveProperty('author_id');
          expect(response.data).toHaveProperty('author_name');
          expect(response.data).toHaveProperty(
            'content',
            'This clip needs adjustment'
          );
          expect(response.data).toHaveProperty('timestamp', 15.5);
          expect(response.data).toHaveProperty('clip_id', validClipId);
          expect(response.data).toHaveProperty('created_at');

          // Verify UUID formats
          expect(response.data.comment_id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );
          expect(response.data.author_id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          );

          done();
        }
      });
    });

    it('should handle chat_message', (done) => {
      const chatMessage = {
        type: 'chat_message',
        data: {
          content: 'Great work on this project!',
          sequence_id: validSequenceId,
        },
        timestamp: new Date().toISOString(),
        user_id: uuidv4(),
        message_id: uuidv4(),
      };

      ws.send(JSON.stringify(chatMessage));

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (response.type === 'chat_message_received') {
          // Verify chat_message_received response structure
          expect(response.data).toHaveProperty('message_id');
          expect(response.data).toHaveProperty('author_id');
          expect(response.data).toHaveProperty('author_name');
          expect(response.data).toHaveProperty(
            'content',
            'Great work on this project!'
          );
          expect(response.data).toHaveProperty('created_at');

          // clip_id should be null for general chat
          expect(response.data.clip_id).toBeNull();

          done();
        }
      });
    });
  });

  describe('Contract: Connection Management', () => {
    const validProjectId = uuidv4();
    const validToken = 'valid-jwt-token';

    it('should handle ping/pong heartbeat', (done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        ws.ping();
      });

      ws.on('pong', () => {
        expect(true).toBe(true); // Pong received
        ws.close();
        done();
      });

      ws.on('error', done);
    });

    it('should enforce rate limiting', (done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        // Send messages rapidly to trigger rate limiting
        for (let i = 0; i < 150; i++) {
          // Exceed 100 messages/minute limit
          const message = {
            type: 'cursor_update',
            data: {
              sequence_id: uuidv4(),
              position: i,
              activity_type: 'editing',
            },
            timestamp: new Date().toISOString(),
            user_id: uuidv4(),
            message_id: uuidv4(),
          };
          ws.send(JSON.stringify(message));
        }
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());

        if (
          response.type === 'error' &&
          response.data.code === 'RATE_LIMIT_EXCEEDED'
        ) {
          expect(response.data.message).toContain('rate limit');
          ws.close();
          done();
        }
      });

      ws.on('error', done);
    });

    it('should close connection after inactivity timeout', (done) => {
      const wsUrl = `${WS_URL}/ws/projects/${validProjectId}?token=${validToken}`;
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        // Don't send any messages to simulate inactivity
      });

      ws.on('close', (code) => {
        expect(code).toBe(1000); // Normal closure due to timeout
        done();
      });

      // Set shorter timeout for test
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          done(
            new Error('Connection should have been closed due to inactivity')
          );
        }
      }, 6000); // Slightly longer than 5 minute timeout
    }).timeout(10000);
  });
});

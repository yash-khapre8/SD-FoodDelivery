require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const addNotificationsTable = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                order_id        UUID REFERENCES orders(order_id) ON DELETE SET NULL,
                message         TEXT NOT NULL,
                event_type      VARCHAR(50) NOT NULL,
                created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                is_read         BOOLEAN DEFAULT FALSE
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
        `);
        console.log('✅ Notifications table created successfully');
    } catch (err) {
        console.error('❌ Failed to create notifications table:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
};

addNotificationsTable();

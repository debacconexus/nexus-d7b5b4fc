const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agencies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        country VARCHAR(100),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        jurisdiction VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id SERIAL PRIMARY KEY,
        incident_number VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        incident_type VARCHAR(100) NOT NULL,
        severity_level INTEGER CHECK (severity_level BETWEEN 1 AND 5),
        location_name VARCHAR(255),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        country VARCHAR(100),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        reported_by INTEGER REFERENCES agencies(id),
        coordinating_agency INTEGER REFERENCES agencies(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        category VARCHAR(100),
        quantity INTEGER DEFAULT 1,
        unit VARCHAR(50),
        owner_agency INTEGER REFERENCES agencies(id),
        current_location VARCHAR(255),
        status VARCHAR(50) DEFAULT 'AVAILABLE',
        specifications JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deployments (
        id SERIAL PRIMARY KEY,
        deployment_id VARCHAR(100) UNIQUE NOT NULL,
        incident_id INTEGER REFERENCES incidents(id),
        resource_id INTEGER REFERENCES resources(id),
        deploying_agency INTEGER REFERENCES agencies(id),
        receiving_agency INTEGER REFERENCES agencies(id),
        deployment_status VARCHAR(50) DEFAULT 'REQUESTED',
        deployment_date TIMESTAMP,
        return_date TIMESTAMP,
        location_deployed VARCHAR(255),
        purpose TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS custody_chain (
        id SERIAL PRIMARY KEY,
        deployment_id INTEGER REFERENCES deployments(id),
        resource_id INTEGER REFERENCES resources(id),
        from_agency INTEGER REFERENCES agencies(id),
        to_agency INTEGER REFERENCES agencies(id),
        transfer_type VARCHAR(50) NOT NULL,
        transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        location VARCHAR(255),
        condition_notes TEXT,
        authorized_by VARCHAR(255),
        received_by VARCHAR(255),
        documentation_url VARCHAR(500),
        signature_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cross_border_sharing (
        id SERIAL PRIMARY KEY,
        sharing_agreement_id VARCHAR(100) UNIQUE NOT NULL,
        source_country VARCHAR(100) NOT NULL,
        destination_country VARCHAR(100) NOT NULL,
        incident_id INTEGER REFERENCES incidents(id),
        resource_types TEXT[],
        approval_status VARCHAR(50) DEFAULT 'PENDING',
        approved_by VARCHAR(255),
        approval_date TIMESTAMP,
        legal_framework VARCHAR(255),
        conditions TEXT,
        expiry_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS incident_logs (
        id SERIAL PRIMARY KEY,
        incident_id INTEGER REFERENCES incidents(id),
        agency_id INTEGER REFERENCES agencies(id),
        log_type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        timestamp_occurred TIMESTAMP NOT NULL,
        location VARCHAR(255),
        personnel_involved TEXT[],
        resources_used TEXT[],
        impact_assessment TEXT,
        next_actions TEXT,
        priority_level INTEGER CHECK (priority_level BETWEEN 1 AND 5),
        tags TEXT[],
        attachments JSONB,
        notes TEXT, -- [IGM-GOVERNED] Multi-agency coordination notes and inter-jurisdictional communication records
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        organization VARCHAR(255),
        role VARCHAR(100),
        message TEXT,
        contact_type VARCHAR(50) DEFAULT 'INQUIRY',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// API Routes

// Agencies CRUD
app.get('/api/agencies', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agencies ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({ error: 'Failed to fetch agencies' });
  }
});

app.post('/api/agencies', async (req, res) => {
  try {
    const { name, type, country, contact_email, contact_phone, jurisdiction } = req.body;
    const result = await pool.query(
      'INSERT INTO agencies (name, type, country, contact_email, contact_phone, jurisdiction) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, type, country, contact_email, contact_phone, jurisdiction]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create agency error:', error);
    res.status(500).json({ error: 'Failed to create agency' });
  }
});

app.put('/api/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, country, contact_email, contact_phone, jurisdiction } = req.body;
    const result = await pool.query(
      'UPDATE agencies SET name = $1, type = $2, country = $3, contact_email = $4, contact_phone = $5, jurisdiction = $6 WHERE id = $7 RETURNING *',
      [name, type, country, contact_email, contact_phone, jurisdiction, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update agency error:', error);
    res.status(500).json({ error: 'Failed to update agency' });
  }
});

app.delete('/api/agencies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM agencies WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    res.json({ message: 'Agency deleted successfully' });
  } catch (error) {
    console.error('Delete agency error:', error);
    res.status(500).json({ error: 'Failed to delete agency' });
  }
});

// Incidents CRUD
app.get('/api/incidents', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, 
             ra.name as reported_by_name, 
             ca.name as coordinating_agency_name
      FROM incidents i
      LEFT JOIN agencies ra ON i.reported_by = ra.id
      LEFT JOIN agencies ca ON i.coordinating_agency = ca.id
      ORDER BY i.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

app.post('/api/incidents', async (req, res) => {
  try {
    const { 
      incident_number, title, description, incident_type, severity_level,
      location_name, latitude, longitude, country, status,
      reported_by, coordinating_agency 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO incidents (
        incident_number, title, description, incident_type, severity_level,
        location_name, latitude, longitude, country, status,
        reported_by, coordinating_agency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [incident_number, title, description, incident_type, severity_level,
       location_name, latitude, longitude, country, status,
       reported_by, coordinating_agency]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

app.put('/api/incidents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;
    updateFields.updated_at = new Date();
    
    const setClause = Object.keys(updateFields).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updateFields)];
    
    const result = await pool.query(
      `UPDATE incidents SET ${setClause} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update incident error:', error);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

// Resources CRUD
app.get('/api/resources', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, a.name as owner_agency_name
      FROM resources r
      LEFT JOIN agencies a ON r.owner_agency = a.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

app.post('/api/resources', async (req, res) => {
  try {
    const { 
      name, type, category, quantity, unit, owner_agency,
      current_location, status, specifications 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO resources (
        name, type, category, quantity, unit, owner_agency,
        current_location, status, specifications
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, type, category, quantity, unit, owner_agency,
       current_location, status, specifications]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ error: 'Failed to create resource' });
  }
});

// Deployments CRUD
app.get('/api/deployments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*,
             i.title as incident_title,
             r.name as resource_name,
             da.name as deploying_agency_name,
             ra.name as receiving_agency_name
      FROM deployments d
      LEFT JOIN incidents i ON d.incident_id = i.id
      LEFT JOIN resources r ON d.resource_id = r.id
      LEFT JOIN agencies da ON d.deploying_agency = da.id
      LEFT JOIN agencies ra ON d.receiving_agency = ra.id
      ORDER BY d.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get deployments error:', error);
    res.status(500).json({ error: 'Failed to fetch deployments' });
  }
});

app.post('/api/deployments', async (req, res) => {
  try {
    const { 
      deployment_id, incident_id, resource_id, deploying_agency,
      receiving_agency, deployment_status, deployment_date,
      return_date, location_deployed, purpose, notes 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO deployments (
        deployment_id, incident_id, resource_id, deploying_agency,
        receiving_agency, deployment_status, deployment_date,
        return_date, location_deployed, purpose, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [deployment_id, incident_id, resource_id, deploying_agency,
       receiving_agency, deployment_status, deployment_date,
       return_date, location_deployed, purpose, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create deployment error:', error);
    res.status(500).json({ error: 'Failed to create deployment' });
  }
});

app.put('/api/deployments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateFields = req.body;
    updateFields.updated_at = new Date();
    
    const setClause = Object.keys(updateFields).map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = [id, ...Object.values(updateFields)];
    
    const result = await pool.query(
      `UPDATE deployments SET ${setClause} WHERE id = $1 RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update deployment error:', error);
    res.status(500).json({ error: 'Failed to update deployment' });
  }
});

// Custody Chain
app.get('/api/custody-chain/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const result = await pool.query(`
      SELECT cc.*,
             fa.name as from_agency_name,
             ta.name as to_agency_name,
             r.name as resource_name
      FROM custody_chain cc
      LEFT JOIN agencies fa ON cc.from_agency = fa.id
      LEFT JOIN agencies ta ON cc.to_agency = ta.id
      LEFT JOIN resources r ON cc.resource_id = r.id
      WHERE cc.resource_id = $1
      ORDER BY cc.transfer_date DESC
    `, [resourceId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get custody chain error:', error);
    res.status(500).json({ error: 'Failed to fetch custody chain' });
  }
});

app.post('/api/custody-chain', async (req, res) => {
  try {
    const { 
      deployment_id, resource_id, from_agency, to_agency, transfer_type,
      location, condition_notes, authorized_by, received_by,
      documentation_url, signature_hash 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO custody_chain (
        deployment_id, resource_id, from_agency, to_agency, transfer_type,
        location, condition_notes, authorized_by, received_by,
        documentation_url, signature_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [deployment_id, resource_id, from_agency, to_agency, transfer_type,
       location, condition_notes, authorized_by, received_by,
       documentation_url, signature_hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create custody chain error:', error);
    res.status(500).json({ error: 'Failed to create custody chain record' });
  }
});

// Cross-border Sharing
app.get('/api/cross-border-sharing', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cb.*,
             i.title as incident_title,
             i.location_name as incident_location
      FROM cross_border_sharing cb
      LEFT JOIN incidents i ON cb.incident_id = i.id
      ORDER BY cb.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get cross-border sharing error:', error);
    res.status(500).json({ error: 'Failed to fetch cross-border sharing agreements' });
  }
});

app.post('/api/cross-border-sharing', async (req, res) => {
  try {
    const { 
      sharing_agreement_id, source_country, destination_country,
      incident_id, resource_types, approval_status, approved_by,
      approval_date, legal_framework, conditions, expiry_date 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO cross_border_sharing (
        sharing_agreement_id, source_country, destination_country,
        incident_id, resource_types, approval_status, approved_by,
        approval_date, legal_framework, conditions, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [sharing_agreement_id, source_country, destination_country,
       incident_id, resource_types, approval_status, approved_by,
       approval_date, legal_framework, conditions, expiry_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create cross-border sharing error:', error);
    res.status(500).json({ error: 'Failed to create cross-border sharing agreement' });
  }
});

// Incident
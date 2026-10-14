CREATE TABLE IF NOT EXISTS events (
  id CHAR(26) PRIMARY KEY,host_id CHAR(26) NOT NULL,community_id CHAR(26) NULL,
  title VARCHAR(150) NOT NULL,description TEXT NOT NULL,
  language VARCHAR(16) NOT NULL DEFAULT 'en-IN',category VARCHAR(100) NULL,
  event_type VARCHAR(20) NOT NULL DEFAULT 'public',mode VARCHAR(20) NOT NULL DEFAULT 'offline',
  pricing_model VARCHAR(20) NOT NULL DEFAULT 'paid',status VARCHAR(20) NOT NULL DEFAULT 'draft',
  start_at DATETIME(3) NOT NULL,end_at DATETIME(3) NOT NULL,
  venue VARCHAR(200) NULL,address VARCHAR(200) NULL,city VARCHAR(100) NULL,
  latitude DECIMAL(10,7) NULL,longitude DECIMAL(10,7) NULL,online_url VARCHAR(2048) NULL,
  target_audience VARCHAR(200) NULL,age_restriction VARCHAR(100) NULL,
  refund_policy VARCHAR(2000) NULL,entry_rules VARCHAR(2000) NULL,max_attendees INT NULL,
  cover_image VARCHAR(2048) NULL,min_price INT NOT NULL DEFAULT 0,
  sold_count INT NOT NULL DEFAULT 0,going_count INT NOT NULL DEFAULT 0,
  avg_rating DECIMAL(2,1) NOT NULL DEFAULT 0.0,rating_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX ix_ev_st (status,start_at),INDEX ix_ev_city (city),INDEX ix_ev_cat (category),INDEX ix_ev_host (host_id)
) ENGINE=InnoDB CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agenda_slots (
  id CHAR(26) PRIMARY KEY,event_id CHAR(26) NOT NULL,slot_time VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,position INT NOT NULL DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,INDEX ix_ag_ev (event_id,position)
) ENGINE=InnoDB CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS event_team (
  id CHAR(26) PRIMARY KEY,event_id CHAR(26) NOT NULL,user_id CHAR(26) NOT NULL,permissions JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  UNIQUE KEY uq_tm (event_id,user_id)
) ENGINE=InnoDB CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS event_views (
  event_id CHAR(26) NOT NULL,user_id CHAR(26) NOT NULL DEFAULT '',anon_key VARCHAR(64) NOT NULL DEFAULT '',viewed_on DATE NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_vw (event_id,viewed_on,user_id,anon_key),
  FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ratings (
  id CHAR(26) PRIMARY KEY,event_id CHAR(26) NOT NULL,user_id CHAR(26) NOT NULL,score TINYINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  UNIQUE KEY uq_rt (event_id,user_id),CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB CHARSET=utf8mb4;

import React, { useEffect, useState, useCallback } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Container, Paper, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Stack, MenuItem, TextField,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { incidentService, ledgerService, Incident } from '../services/api';

// Feature 10 (Alert Panel + Incident Management) + Feature 13 (ledger verification UI)
const severityColor: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  LOW: 'default', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'error',
};
const statusColor: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
  NEW: 'error', ACKNOWLEDGED: 'warning', RESPONDING: 'info', RESOLVED: 'success',
};

const IncidentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [ledgerResult, setLedgerResult] = useState<any>(null);

  const load = useCallback(async () => {
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.eventType = typeFilter;
    const res = await incidentService.list(params);
    setIncidents(res.incidents || []);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  const act = async (id: string, action: 'acknowledge' | 'respond' | 'resolve') => {
    await incidentService[action](id);
    load();
  };

  const verifyLedger = async () => {
    const res = await ledgerService.verify();
    setLedgerResult(res);
  };

  const touristLabel = (t: Incident['tourist']) => (typeof t === 'string' ? t : `${t?.name || ''} (${t?.digitalId || ''})`);

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Incidents &amp; Alerts</Typography>
          <Button color="inherit" onClick={() => navigate('/dashboard')}>Overview</Button>
          <Button color="inherit" onClick={() => navigate('/map')}>Live Map</Button>
          <Button color="inherit" onClick={() => navigate('/zones')}>Zones</Button>
          <Button color="inherit" onClick={() => navigate('/safety')}>Safety Intelligence</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField select size="small" label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="NEW">New</MenuItem>
            <MenuItem value="ACKNOWLEDGED">Acknowledged</MenuItem>
            <MenuItem value="RESPONDING">Responding</MenuItem>
            <MenuItem value="RESOLVED">Resolved</MenuItem>
          </TextField>
          <TextField select size="small" label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="SOS">SOS</MenuItem>
            <MenuItem value="GEOFENCE_WARNING">Geofence Warning</MenuItem>
            <MenuItem value="GEOFENCE_VIOLATION">Geofence Violation</MenuItem>
            <MenuItem value="AI_RISK">AI Risk</MenuItem>
            <MenuItem value="LOW_BATTERY">Low Battery</MenuItem>
            <MenuItem value="LOCATION_SYNCED">Location Synced</MenuItem>
          </TextField>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" onClick={verifyLedger}>Verify Tamper-Evident Ledger</Button>
        </Stack>

        {ledgerResult && (
          <Paper sx={{ p: 2, mb: 2, bgcolor: ledgerResult.valid ? '#e8f5e9' : '#ffebee' }}>
            <Typography variant="subtitle1">
              Ledger Prototype: {ledgerResult.valid ? 'INTACT ✅' : 'TAMPERING DETECTED ⚠️'}
            </Typography>
            <Typography variant="body2">
              Records checked: {ledgerResult.recordsChecked} · Breaks: {ledgerResult.breaks?.length || 0} · Verified at {ledgerResult.verifiedAt}
            </Typography>
          </Paper>
        )}

        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Tourist</TableCell>
                  <TableCell>Zone</TableCell>
                  <TableCell>Message</TableCell>
                  <TableCell>Recommended Action</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {incidents.map((inc) => (
                  <TableRow key={inc._id}>
                    <TableCell>{inc.eventType}</TableCell>
                    <TableCell><Chip size="small" label={inc.severity} color={severityColor[inc.severity]} /></TableCell>
                    <TableCell>
                      {typeof inc.priorityScore === 'number' && (
                        <Chip size="small" label={`${inc.priorityLevel} (${inc.priorityScore})`} color={severityColor[inc.priorityLevel || 'LOW']} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>{touristLabel(inc.tourist)}</TableCell>
                    <TableCell>{inc.zone?.name || '-'}</TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>{inc.message}</TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="caption">{inc.recommendedAction}</Typography>
                    </TableCell>
                    <TableCell><Chip size="small" label={inc.status} color={statusColor[inc.status]} /></TableCell>
                    <TableCell>{new Date(inc.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      {inc.status === 'NEW' && <Button size="small" onClick={() => act(inc._id, 'acknowledge')}>Acknowledge</Button>}
                      {inc.status === 'ACKNOWLEDGED' && <Button size="small" onClick={() => act(inc._id, 'respond')}>Respond</Button>}
                      {(inc.status === 'ACKNOWLEDGED' || inc.status === 'RESPONDING') && (
                        <Button size="small" color="success" onClick={() => act(inc._id, 'resolve')}>Resolve</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {incidents.length === 0 && (
                  <TableRow><TableCell colSpan={10} align="center">No incidents match this filter</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </Box>
  );
};

export default IncidentsPage;

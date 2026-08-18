import React, { useEffect, useState } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Container, Paper, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Stack, IconButton, Alert,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate } from 'react-router-dom';
import { zoneService, Zone } from '../services/api';

// Feature 7: Authority Zone Management. Zones are kept as simple CIRCLES
// (center + radius) for a fast, no-drawing-tool authority workflow; the
// backend also fully supports arbitrary Polygon zones for teams that want
// to submit GeoJSON boundaries directly (via the same API).
const ZonesPage: React.FC = () => {
  const navigate = useNavigate();
  const [zones, setZones] = useState<Zone[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', zoneType: 'RESTRICTED', lat: '', lng: '',
    radiusMeters: '500', warningDistanceMeters: '250',
  });

  const load = async () => {
    const res = await zoneService.list();
    setZones(res.zones || []);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError(null);
    try {
      await zoneService.create({
        name: form.name,
        description: form.description,
        zoneType: form.zoneType as Zone['zoneType'],
        geometry: {
          type: 'Circle',
          center: { coordinates: [parseFloat(form.lng), parseFloat(form.lat)] },
          radiusMeters: parseFloat(form.radiusMeters),
        },
        warningDistanceMeters: parseFloat(form.warningDistanceMeters),
      });
      setOpen(false);
      setForm({ name: '', description: '', zoneType: 'RESTRICTED', lat: '', lng: '', radiusMeters: '500', warningDistanceMeters: '250' });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create zone');
    }
  };

  const toggleStatus = async (zone: Zone) => {
    await zoneService.setStatus(zone._id, zone.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    load();
  };

  const remove = async (zone: Zone) => {
    if (!window.confirm(`Delete zone "${zone.name}"?`)) return;
    await zoneService.remove(zone._id);
    load();
  };

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Zone Management</Typography>
          <Button color="inherit" onClick={() => navigate('/dashboard')}>Overview</Button>
          <Button color="inherit" onClick={() => navigate('/map')}>Live Map</Button>
          <Button color="inherit" onClick={() => navigate('/incidents')}>Incidents</Button>
          <Button color="inherit" onClick={() => navigate('/safety')}>Safety Intelligence</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ mt: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button variant="contained" onClick={() => setOpen(true)}>+ New Zone</Button>
        </Stack>
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Geometry</TableCell>
                  <TableCell>Warning Distance</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone._id}>
                    <TableCell>{zone.name}</TableCell>
                    <TableCell><Chip size="small" label={zone.zoneType} color={zone.zoneType === 'RESTRICTED' ? 'error' : zone.zoneType === 'RISK' ? 'warning' : 'success'} /></TableCell>
                    <TableCell>
                      {zone.geometry.type === 'Circle'
                        ? `Circle · r=${zone.geometry.radiusMeters}m`
                        : `Polygon · ${zone.geometry.polygon?.coordinates[0]?.length || 0} pts`}
                    </TableCell>
                    <TableCell>{zone.warningDistanceMeters}m</TableCell>
                    <TableCell><Chip size="small" label={zone.status} color={zone.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => toggleStatus(zone)}>
                        {zone.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <IconButton size="small" onClick={() => remove(zone)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {zones.length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center">No zones configured yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Zone</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Zone name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
            <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth />
            <TextField select label="Zone type" value={form.zoneType} onChange={(e) => setForm({ ...form, zoneType: e.target.value })} fullWidth>
              <MenuItem value="RESTRICTED">Restricted (prohibited area)</MenuItem>
              <MenuItem value="RISK">Risk (elevated caution)</MenuItem>
              <MenuItem value="SAFE">Safe / Permitted</MenuItem>
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField label="Center latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} fullWidth />
              <TextField label="Center longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="Radius (metres)" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} fullWidth />
              <TextField label="Warning distance (metres)" value={form.warningDistanceMeters} onChange={(e) => setForm({ ...form, warningDistanceMeters: e.target.value })} fullWidth
                helperText="Not hard-coded - configurable per zone (demo default 250m)" />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ZonesPage;

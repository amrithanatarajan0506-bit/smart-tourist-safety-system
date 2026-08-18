import React, { useEffect, useState, useCallback } from 'react';
import {
  AppBar, Toolbar, Typography, Box, Container, Paper, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Button,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { dashboardService, zoneService, TouristStatusRow, Zone } from '../services/api';

// Default Leaflet marker icons don't resolve correctly with bundlers - fix once here.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const statusColor: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  SAFE: 'success', WARNING: 'warning', VIOLATION: 'error', UNKNOWN: 'default',
};
const locationColor: Record<string, 'success' | 'info' | 'default' | 'warning'> = {
  LIVE: 'success', LAST_KNOWN: 'info', OFFLINE: 'warning', UNKNOWN: 'default',
};

const DEFAULT_CENTER: [number, number] = [28.6139, 77.2090]; // New Delhi fallback

const LiveMapPage: React.FC = () => {
  const navigate = useNavigate();
  const [tourists, setTourists] = useState<TouristStatusRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  const load = useCallback(async () => {
    try {
      const [t, z] = await Promise.all([dashboardService.tourists(), zoneService.list()]);
      setTourists(t.tourists || []);
      setZones(z.zones || []);
    } catch (e) {
      console.error('Failed to load live map data', e);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000); // Feature 4/10: near-real-time refresh
    return () => clearInterval(interval);
  }, [load]);

  const center = tourists.find((t) => t.lastLocation)?.lastLocation?.coordinates;
  const mapCenter: [number, number] = center ? [center[1], center[0]] : DEFAULT_CENTER;

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Live Monitoring Map</Typography>
          <Button color="inherit" onClick={() => navigate('/dashboard')}>Overview</Button>
          <Button color="inherit" onClick={() => navigate('/zones')}>Zones</Button>
          <Button color="inherit" onClick={() => navigate('/incidents')}>Incidents</Button>
          <Button color="inherit" onClick={() => navigate('/safety')}>Safety Intelligence</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ mt: 3, mb: 3 }}>
        <Paper sx={{ height: 520, mb: 3, overflow: 'hidden' }}>
          <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {zones.map((zone) => {
              if (zone.status !== 'ACTIVE') return null;
              const color = zone.zoneType === 'RESTRICTED' ? '#d32f2f' : zone.zoneType === 'RISK' ? '#ed6c02' : '#2e7d32';
              if (zone.geometry.type === 'Circle' && zone.geometry.center) {
                const [lng, lat] = zone.geometry.center.coordinates;
                return (
                  <Circle key={zone._id} center={[lat, lng]} radius={zone.geometry.radiusMeters || 0}
                    pathOptions={{ color, fillOpacity: 0.15 }}>
                    <Popup>{zone.name} ({zone.zoneType})</Popup>
                  </Circle>
                );
              }
              if (zone.geometry.type === 'Polygon' && zone.geometry.polygon) {
                const ring = zone.geometry.polygon.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
                return (
                  <Polygon key={zone._id} positions={ring} pathOptions={{ color, fillOpacity: 0.15 }}>
                    <Popup>{zone.name} ({zone.zoneType})</Popup>
                  </Polygon>
                );
              }
              return null;
            })}
            {tourists.filter((t) => t.lastLocation).map((t) => {
              const [lng, lat] = t.lastLocation!.coordinates;
              return (
                <Marker key={t.tripId} position={[lat, lng]}>
                  <Popup>
                    <strong>{t.tourist?.name}</strong> ({t.tourist?.digitalId})<br />
                    Status: {t.zoneStatus} / {t.locationState}<br />
                    Updated: {new Date(t.lastLocation!.timestamp).toLocaleTimeString()}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Active Tourists ({tourists.length})</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tourist</TableCell>
                  <TableCell>Digital ID</TableCell>
                  <TableCell>Trip</TableCell>
                  <TableCell>Geo-fence Status</TableCell>
                  <TableCell>Location State</TableCell>
                  <TableCell>Last Update</TableCell>
                  <TableCell>Points</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tourists.map((t) => (
                  <TableRow key={t.tripId}>
                    <TableCell>{t.tourist?.name}</TableCell>
                    <TableCell>{t.tourist?.digitalId}</TableCell>
                    <TableCell>{t.tripId}</TableCell>
                    <TableCell><Chip size="small" label={t.zoneStatus} color={statusColor[t.zoneStatus]} /></TableCell>
                    <TableCell><Chip size="small" label={t.locationState} color={locationColor[t.locationState]} /></TableCell>
                    <TableCell>{t.lastLocation ? new Date(t.lastLocation.timestamp).toLocaleString() : '-'}</TableCell>
                    <TableCell>{t.pointCount}</TableCell>
                  </TableRow>
                ))}
                {tourists.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center">No active trips right now</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </Box>
  );
};

export default LiveMapPage;

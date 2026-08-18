import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
} from '@mui/material';

const SafetyIntelligencePage: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Safety Intelligence
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        AI-powered safety monitoring and risk intelligence for tourists.
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(3, 1fr)',
          },
          gap: 3,
        }}
      >
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Current Risk Level</Typography>

          <Chip
            label="LOW RISK"
            color="success"
            sx={{ mt: 2, fontWeight: 'bold' }}
          />
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">AI Monitoring</Typography>

          <Typography sx={{ mt: 2 }}>
            Monitoring tourist movement, zone activity, and unusual behavior.
          </Typography>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">Safety Alerts</Typography>

          <Typography sx={{ mt: 2 }}>
            No critical safety alerts detected.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
};

export default SafetyIntelligencePage;
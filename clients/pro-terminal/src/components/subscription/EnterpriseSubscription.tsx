import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';

interface EnterpriseFeature {
  id: string;
  name: string;
  description: string;
  included: boolean;
  usage?: {
    current: number;
    limit: number | null;
    unit: string;
  };
}

interface LicenseInfo {
  type: 'enterprise' | 'institutional' | 'market_maker';
  seats: number;
  usedSeats: number;
  expiryDate: string;
  features: EnterpriseFeature[];
  support: {
    level: 'standard' | 'premium' | 'dedicated';
    sla: string;
    contactInfo: {
      email: string;
      phone: string;
      manager?: string;
    };
  };
}

interface EnterpriseSubscriptionProps {
  organizationId: string;
}

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  background: #0a0a0a;
  color: #fff;
  min-height: 100vh;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: #888;
  margin-bottom: 24px;
`;

const StatusCard = styled(motion.div)<{ status: 'active' | 'expiring' | 'expired' }>`
  background: ${props => {
    switch (props.status) {
      case 'active': return 'linear-gradient(135deg, #10b981, #059669)';
      case 'expiring': return 'linear-gradient(135deg, #f59e0b, #d97706)';
      case 'expired': return 'linear-gradient(135deg, #ef4444, #dc2626)';
    }
  }};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 32px;
  color: white;
`;

const StatusHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const StatusTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
`;

const StatusBadge = styled.div<{ status: string }>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
`;

const StatusGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
`;

const StatusItem = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
`;

const StatusLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.8;
  margin-bottom: 4px;
`;

const StatusValue = styled.div`
  font-size: 1.25rem;
  font-weight: 600;
`;

const TabContainer = styled.div`
  display: flex;
  border-bottom: 1px solid #333;
  margin-bottom: 32px;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 12px 24px;
  border: none;
  background: none;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid ${props => props.active ? '#667eea' : 'transparent'};
  color: ${props => props.active ? '#667eea' : '#888'};
  transition: all 0.2s ease;
  
  &:hover {
    color: #667eea;
  }
`;

const Section = styled.div`
  background: #1a1a1a;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #333;
`;

const SectionTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 20px;
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
`;

const FeatureCard = styled(motion.div)<{ included: boolean }>`
  background: ${props => props.included ? '#2a2a2a' : '#1a1a1a'};
  border: 1px solid ${props => props.included ? '#667eea' : '#333'};
  border-radius: 8px;
  padding: 20px;
  opacity: ${props => props.included ? 1 : 0.6};
`;

const FeatureName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
`;

const FeatureDescription = styled.div`
  font-size: 0.875rem;
  color: #888;
  margin-bottom: 12px;
  line-height: 1.4;
`;

const FeatureUsage = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
`;

const UsageBar = styled.div`
  flex: 1;
  height: 6px;
  background: #333;
  border-radius: 3px;
  overflow: hidden;
  margin-right: 12px;
`;

const UsageFill = styled.div<{ percentage: number }>`
  height: 100%;
  width: ${props => Math.min(props.percentage, 100)}%;
  background: linear-gradient(90deg, #10b981, #059669);
  border-radius: 3px;
  transition: width 0.3s ease;
`;

const UsageText = styled.div`
  font-size: 0.75rem;
  color: #888;
  font-family: monospace;
`;

const SupportSection = styled.div`
  background: linear-gradient(135deg, #1e3a8a, #1e40af);
  border-radius: 12px;
  padding: 24px;
  color: white;
`;

const SupportGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-top: 20px;
`;

const SupportCard = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
`;

const ContactButton = styled(motion.button)`
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  padding: 12px 24px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  margin-top: 16px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const EnterpriseSubscription: React.FC<EnterpriseSubscriptionProps> = ({ organizationId }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'features' | 'usage' | 'support'>('overview');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLicenseInfo();
  }, [organizationId]);

  const loadLicenseInfo = async () => {
    try {
      // Mock data - replace with actual API call
      const mockLicenseInfo: LicenseInfo = {
        type: 'enterprise',
        seats: 100,
        usedSeats: 67,
        expiryDate: '2024-12-31',
        features: [
          {
            id: 'unlimited_api',
            name: 'Unlimited API Calls',
            description: 'No limits on API requests for market data and trading',
            included: true,
            usage: { current: 2500000, limit: null, unit: 'calls/month' },
          },
          {
            id: 'real_time_data',
            name: 'Real-time Market Data',
            description: 'Live market data feeds from all major exchanges',
            included: true,
            usage: { current: 45, limit: 100, unit: 'feeds' },
          },
          {
            id: 'algorithmic_trading',
            name: 'Advanced Algorithmic Trading',
            description: 'TWAP, VWAP, Implementation Shortfall, and custom algorithms',
            included: true,
          },
          {
            id: 'white_label',
            name: 'White Label Solutions',
            description: 'Customize the platform with your branding',
            included: true,
          },
          {
            id: 'dedicated_infrastructure',
            name: 'Dedicated Infrastructure',
            description: 'Private cloud deployment with guaranteed resources',
            included: true,
          },
          {
            id: 'custom_development',
            name: 'Custom Development',
            description: 'Bespoke features and integrations',
            included: true,
            usage: { current: 120, limit: 200, unit: 'hours/quarter' },
          },
        ],
        support: {
          level: 'dedicated',
          sla: '99.9% uptime guarantee',
          contactInfo: {
            email: 'enterprise@nexustrade.ai',
            phone: '+1-800-NEXUS-AI',
            manager: 'Sarah Johnson',
          },
        },
      };

      setLicenseInfo(mockLicenseInfo);
    } catch (error) {
      console.error('Failed to load license info:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusType = (expiryDate: string): 'active' | 'expiring' | 'expired' => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 30) return 'expiring';
    return 'active';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading || !licenseInfo) {
    return (
      <Container>
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div>Loading enterprise license information...</div>
        </div>
      </Container>
    );
  }

  const statusType = getStatusType(licenseInfo.expiryDate);

  return (
    <Container>
      <Header>
        <Title>Enterprise License</Title>
        <Subtitle>Manage your institutional trading platform license and features</Subtitle>
      </Header>

      {/* License Status */}
      <StatusCard
        status={statusType}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <StatusHeader>
          <StatusTitle>License Status</StatusTitle>
          <StatusBadge status={statusType}>
            {statusType.toUpperCase()}
          </StatusBadge>
        </StatusHeader>
        
        <StatusGrid>
          <StatusItem>
            <StatusLabel>License Type</StatusLabel>
            <StatusValue>{licenseInfo.type.replace('_', ' ').toUpperCase()}</StatusValue>
          </StatusItem>
          <StatusItem>
            <StatusLabel>Seats Used</StatusLabel>
            <StatusValue>{licenseInfo.usedSeats} / {licenseInfo.seats}</StatusValue>
          </StatusItem>
          <StatusItem>
            <StatusLabel>Expiry Date</StatusLabel>
            <StatusValue>{formatDate(licenseInfo.expiryDate)}</StatusValue>
          </StatusItem>
          <StatusItem>
            <StatusLabel>Support Level</StatusLabel>
            <StatusValue>{licenseInfo.support.level.toUpperCase()}</StatusValue>
          </StatusItem>
        </StatusGrid>
      </StatusCard>

      {/* Navigation Tabs */}
      <TabContainer>
        <Tab active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
          Overview
        </Tab>
        <Tab active={activeTab === 'features'} onClick={() => setActiveTab('features')}>
          Features
        </Tab>
        <Tab active={activeTab === 'usage'} onClick={() => setActiveTab('usage')}>
          Usage Analytics
        </Tab>
        <Tab active={activeTab === 'support'} onClick={() => setActiveTab('support')}>
          Support
        </Tab>
      </TabContainer>

      {/* Content Sections */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Section>
              <SectionTitle>License Overview</SectionTitle>
              <FeatureGrid>
                {licenseInfo.features.slice(0, 4).map((feature) => (
                  <FeatureCard
                    key={feature.id}
                    included={feature.included}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <FeatureName>{feature.name}</FeatureName>
                    <FeatureDescription>{feature.description}</FeatureDescription>
                    {feature.usage && (
                      <FeatureUsage>
                        <UsageBar>
                          <UsageFill 
                            percentage={feature.usage.limit ? (feature.usage.current / feature.usage.limit) * 100 : 50} 
                          />
                        </UsageBar>
                        <UsageText>
                          {formatNumber(feature.usage.current)}
                          {feature.usage.limit && ` / ${formatNumber(feature.usage.limit)}`}
                          {` ${feature.usage.unit}`}
                        </UsageText>
                      </FeatureUsage>
                    )}
                  </FeatureCard>
                ))}
              </FeatureGrid>
            </Section>
          </motion.div>
        )}

        {activeTab === 'features' && (
          <motion.div
            key="features"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Section>
              <SectionTitle>All Features</SectionTitle>
              <FeatureGrid>
                {licenseInfo.features.map((feature) => (
                  <FeatureCard
                    key={feature.id}
                    included={feature.included}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <FeatureName>{feature.name}</FeatureName>
                    <FeatureDescription>{feature.description}</FeatureDescription>
                    {feature.usage && (
                      <FeatureUsage>
                        <UsageBar>
                          <UsageFill 
                            percentage={feature.usage.limit ? (feature.usage.current / feature.usage.limit) * 100 : 50} 
                          />
                        </UsageBar>
                        <UsageText>
                          {formatNumber(feature.usage.current)}
                          {feature.usage.limit && ` / ${formatNumber(feature.usage.limit)}`}
                          {` ${feature.usage.unit}`}
                        </UsageText>
                      </FeatureUsage>
                    )}
                  </FeatureCard>
                ))}
              </FeatureGrid>
            </Section>
          </motion.div>
        )}

        {activeTab === 'support' && (
          <motion.div
            key="support"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <SupportSection>
              <SectionTitle>Enterprise Support</SectionTitle>
              <SupportGrid>
                <SupportCard>
                  <h4>Dedicated Account Manager</h4>
                  <p>{licenseInfo.support.contactInfo.manager}</p>
                  <ContactButton
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Schedule Meeting
                  </ContactButton>
                </SupportCard>
                
                <SupportCard>
                  <h4>24/7 Technical Support</h4>
                  <p>Email: {licenseInfo.support.contactInfo.email}</p>
                  <p>Phone: {licenseInfo.support.contactInfo.phone}</p>
                  <ContactButton
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Contact Support
                  </ContactButton>
                </SupportCard>
                
                <SupportCard>
                  <h4>Service Level Agreement</h4>
                  <p>{licenseInfo.support.sla}</p>
                  <p>Response time: &lt; 1 hour</p>
                  <ContactButton
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View SLA Details
                  </ContactButton>
                </SupportCard>
              </SupportGrid>
            </SupportSection>
          </motion.div>
        )}
      </AnimatePresence>
    </Container>
  );
};

export default EnterpriseSubscription;

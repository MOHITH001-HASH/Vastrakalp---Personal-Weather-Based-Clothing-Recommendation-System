import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';

const router = Router();

router.post('/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user!.uid;
  const email = req.user!.email || 'User';

  try {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create a default family
      const familyRef = db.collection('families').doc();
      const now = Date.now();
      
      await familyRef.set({
        familyName: `${email.split('@')[0]}'s Family`,
        createdAt: now
      });

      // Create user profile
      const userProfile = {
        familyId: familyRef.id,
        firstName: email.split('@')[0],
        role: 'admin',
        createdAt: now,
        preferences: {
          avoidColors: [],
          fitPreference: 'regular'
        }
      };

      await userRef.set(userProfile);
      return res.json({ message: 'User and Family created', user: userProfile, familyId: familyRef.id });
    } else {
      return res.json({ message: 'User synced', user: userDoc.data(), familyId: userDoc.data()?.familyId });
    }
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { getSetting } from 'meteor/vulcan:core'
import { Comments } from './index';
import moment from 'moment';
import { ensureIndex } from '../../collectionUtils';

// Recent Comments query index
ensureIndex(Comments, {'postedAt': -1, '_id': -1});

// Auto-generated indexes from production
ensureIndex(Comments, {postId:1}, {background:true});
ensureIndex(Comments, {inactive:1}, {background:true});
ensureIndex(Comments, {postId:1,postedAt:-1,_id:-1}, {background:true});
ensureIndex(Comments, {userId:1,postedAt:-1,_id:-1,deleted:1}, {background:true});
ensureIndex(Comments, {legacyId:1}, {background:true});
ensureIndex(Comments, {postId:1,baseScore:-1,postedAt:-1,_id:-1,deleted:1}, {background:true});
ensureIndex(Comments, {postedAt:-1,_id:-1,deleted:1}, {background:true});
ensureIndex(Comments, {inactive:1,postedAt:1}, {background:true});

Comments.addDefaultView(terms => {
  const validFields = _.pick(terms, 'userId');
  const alignmentForum = getSetting('AlignmentForum', false) ? {af: true} : {}
  return ({
    selector: {
      $or: [{$and: [{deleted: true}, {deletedPublic: true}]}, {deleted: {$ne: true}}],
      answer: { $ne: true },
      hideAuthor: terms.userId ? {$ne: true} : undefined,
      ...validFields,
      ...alignmentForum,
    }
  });
})

/*

Comments views

*/

Comments.addView("commentReplies", function (terms) {
  return {
    selector: {
      parentCommentId: terms.parentCommentId,
    },
    options: {
      sort: {createdAt: -1}
    }
  }
})

Comments.addView("postCommentsDeleted", function (terms) {
  return {
    selector: {
      $or: null,
      deleted: null,
      postId: terms.postId
    },
    options: {sort: {deletedDate: -1, baseScore: -1, postedAt: -1}}
  };
});

Comments.addView("allCommentsDeleted", function (terms) {
  return {
    selector: {
      $or: null,
      deleted: true,
    },
    options: {sort: {deletedDate: -1, postedAt: -1, baseScore: -1 }}
  };
});

Comments.addView("postCommentsTop", function (terms) {
  return {
    selector: { postId: terms.postId },
    options: {sort: {deleted: 1, baseScore: -1, postedAt: -1}}
  };
});

Comments.addView("postCommentsOld", function (terms) {
  return {
    selector: { postId: terms.postId },
    options: {sort: {deleted: 1, postedAt: 1}}
  };
});

Comments.addView("postCommentsNew", function (terms) {
  return {
    selector: { postId: terms.postId },
    options: {sort: {deleted: 1, postedAt: -1}}
  };
});

Comments.addView("postCommentsBest", function (terms) {
  return {
    selector: { postId: terms.postId },
    options: {sort: {deleted: 1, baseScore: -1}, postedAt: -1}
  };
});

Comments.addView("postLWComments", function (terms) {
  return {
    selector: { postId: terms.postId, af: null },
    options: {sort: {deleted: 1, baseScore: -1, postedAt: -1}}
  };
});

Comments.addView("allRecentComments", function (terms) {
  return {
    selector: {deletedPublic: {$ne:true}},
    options: {sort: {postedAt: -1}, limit: terms.limit || 5},
  };
});

Comments.addView("recentComments", function (terms) {
  return {
    selector: { score:{$gt:0}, deletedPublic: {$ne: true}},
    options: {sort: {postedAt: -1}, limit: terms.limit || 5},
  };
});

Comments.addView("recentDiscussionThread", function (terms) {
  const eighteenHoursAgo = moment().subtract(18, 'hours').toDate();
  return {
    selector: {
      postId: terms.postId,
      score: {$gt:0},
      deletedPublic: {$ne: true},
      postedAt: {$gt: eighteenHoursAgo}
    },
    options: {sort: {postedAt: -1}, limit: terms.limit || 5}
  };
})

Comments.addView("afRecentDiscussionThread", function (terms) {
  const sevenDaysAgo = moment().subtract(7, 'days').toDate();
  return {
    selector: {
      postId: terms.postId,
      score: {$gt:0},
      deletedPublic: {$ne: true},
      postedAt: {$gt: sevenDaysAgo},
      af: true,
    },
    options: {sort: {postedAt: -1}, limit: terms.limit || 5}
  };
})

Comments.addView("postCommentsUnread", function (terms) {
  return {
    selector: {
      postId: terms.postId,
      deleted: {$ne: true },
      score: {$gt: 0}
    },
    options: {sort: {postedAt: -1}, limit: terms.limit || 15},
  };
});

Comments.addView("sunshineNewCommentsList", function (terms) {
  const twoDaysAgo = moment().subtract(2, 'days').toDate();
  return {
    selector: {
      $or: [
        {$and: []},
        {needsReview: true},
        {baseScore: {$lte:0}}
      ],
      reviewedByUserId: {$exists:false},
      deleted: {$ne: true},
      postedAt: {$gt: twoDaysAgo},
    },
    options: {sort: {postedAt: -1}, limit: terms.limit || 5},
  };
});

Comments.addView('questionAnswers', function (terms) {
  return {
    selector: {postId: terms.postId, answer: true},
    options: {sort: {chosenAnswer: 1, baseScore: -1, postedAt: -1}}
  };
});

import React from 'react';
import { Comments, Posts } from "meteor/example-forum";
import { addCallback, removeCallback, runCallbacksAsync, newMutation, editMutation } from 'meteor/vulcan:core';
import Users from "meteor/vulcan:users";
import { convertFromRaw, ContentState, convertToRaw } from 'draft-js';
import { draftToHTML } from '../../editor/utils.js';
import { preProcessLatex } from '../../editor/server/utils.js';
import { performVoteServer } from 'meteor/vulcan:voting';

import { createError } from 'apollo-errors';
import Messages from '../messages/collection.js';
import Conversations from '../conversations/collection.js';

import TurndownService from 'turndown';
const turndownService = new TurndownService()
// function commentsSoftRemoveChildrenComments(comment) {
//     const childrenComments = Comments.find({parentCommentId: comment._id}).fetch();
//     childrenComments.forEach(childComment => {
//       editMutation({
//         documentId: childComment._id,
//         set: {deleted:true},
//         unset: {}
//       }).then(()=>console.log('comment softRemoved')).catch(/* error */);
//     });
// }

const getLessWrongAccount = async () => {
  let account = Users.findOne({username: "LessWrong"});
  if (!account) {
    const userData = {
      username: "LessWrong",
      email: "lesswrong@lesswrong.com",
    }
    account = await newMutation({
      collection: Users,
      document: userData,
      validate: false,
    })
  }
  return account;
}


Comments.convertFromContentAsync = async function(content) {
  content = await preProcessLatex(content);
  return Comments.convertFromContent(content)
}

/*
 * @summary Takes in a content field, returns object with {htmlBody, body, excerpt}
*/

Comments.convertFromContent = (content) => {
  const contentState = convertFromRaw(content);
  const htmlBody = draftToHTML(contentState)
  return {
    htmlBody: htmlBody,
    body: turndownService.turndown(htmlBody)
  }
}

/*
 * @summary Input is html, returns object with {body, excerpt}
*/

Comments.convertFromHTML = (html) => {
  const body = turndownService.turndown(html);
  return {
    body
  }
}

function CommentsEditSoftDeleteCallback (comment, oldComment) {
  if (comment.deleted && !oldComment.deleted) {
    runCallbacksAsync('comments.moderate.async', comment);
  }
}
addCallback("comments.edit.async", CommentsEditSoftDeleteCallback);


function ModerateCommentsPostUpdate (comment, oldComment) {
  const comments = Comments.find({postId:comment.postId, deleted: {$ne: true}}).fetch()

  const lastComment = _.max(comments, function(c){return c.postedAt;})
  const lastCommentedAt = (lastComment && lastComment.postedAt) || Posts.findOne({_id:comment.postId}).postedAt

  editMutation({
    collection:Posts,
    documentId: comment.postId,
    set: {
      lastCommentedAt:new Date(lastCommentedAt),
      commentCount:comments.length
    },
    unset: {}
  })
}
addCallback("comments.moderate.async", ModerateCommentsPostUpdate);


function CommentsNewHTMLSerializeCallback (comment) {
  if (comment.content) {
    const newFields = Comments.convertFromContent(comment.content);
    comment = {...comment, ...newFields}
  } else if (comment.htmlBody) {
    const newFields = Comments.convertFromHTML(comment.htmlBody);
    comment = {...comment, ...newFields}
  }
  return comment
}

addCallback("comments.new.sync", CommentsNewHTMLSerializeCallback);

function CommentsEditHTMLSerializeCallback (modifier, comment) {
  if (modifier.$set && modifier.$set.content) {
    const newFields = Comments.convertFromContent(modifier.$set.content)
    modifier.$set = {...modifier.$set, ...newFields}
  } else if (modifier.$set && modifier.$set.htmlBody) {
    const newFields = Comments.convertFromHTML(modifier.$set.htmlBody);
    modifier.$set = {...modifier.$set, ...newFields}
  }
  return modifier
}

addCallback("comments.edit.sync", CommentsEditHTMLSerializeCallback);

function NewCommentsEmptyCheck (comment, user) {
  if (!comment.htmlBody &&
      !comment.body &&
      (!comment.content || !convertFromRaw(comment.content).hasText())) {
    const EmptyCommentError = createError('comments.comment_empty_error', {message: 'comments.comment_empty_error'});
    throw new EmptyCommentError({data: {break: true, value: comment}});
  }
  return comment;
}

addCallback("comments.new.validate", NewCommentsEmptyCheck);


export async function CommentsHTMLSerializeCallbackAsync (comment) {
  if (comment.content) {
    const newFields = await Comments.convertFromContentAsync(comment.content);
    Comments.update({_id: comment._id}, {$set: newFields})
  } else if (comment.htmlBody) {
    const newFields = Comments.convertFromHTML(comment.htmlBody);
    Comments.update({_id: comment._id}, {$set: newFields})
  }
}

addCallback("comments.edit.async", CommentsHTMLSerializeCallbackAsync);
addCallback("comments.new.async", CommentsHTMLSerializeCallbackAsync);

export async function CommentsDeleteSendPMAsync (newComment, oldComment, context) {
  if (newComment.deleted && !oldComment.deleted && newComment.content) {
    const originalPost = Posts.findOne(newComment.postId);
    const moderatingUser = Users.findOne(newComment.deletedByUserId);
    const lwAccount = await getLessWrongAccount();

    const conversationData = {
      participantIds: [newComment.userId, lwAccount._id],
      title: `Comment deleted on ${originalPost.title}`
    }
    const conversation = await newMutation({
      collection: Conversations,
      document: conversationData,
      currentUser: lwAccount,
      validate: false,
      context
    });

    let firstMessageContent =
        `One of your comments on "${originalPost.title}" has been removed by ${moderatingUser.displayName}. We've sent you another PM with the content.`
    if (newComment.deletedReason) {
      firstMessageContent += ` They gave the following reason: "${newComment.deletedReason}".`;
    }

    const firstMessageData = {
      userId: lwAccount._id,
      content: convertToRaw(ContentState.createFromText(firstMessageContent)),
      conversationId: conversation._id
    }

    const secondMessageData = {
      userId: lwAccount._id,
      content: newComment.content,
      conversationId: conversation._id
    }

    newMutation({
      collection: Messages,
      document: firstMessageData,
      currentUser: lwAccount,
      validate: false,
      context
    })

    newMutation({
      collection: Messages,
      document: secondMessageData,
      currentUser: lwAccount,
      validate: false,
      context
    })
  }
}

addCallback("comments.moderate.async", CommentsDeleteSendPMAsync);

//LESSWRONG: Remove original LWCommentsNewUpvoteOwnComment from Vulcan
removeCallback('comments.new.after', 'CommentsNewUpvoteOwnComment');

/**
 * @summary Make users upvote their own new comments
 */

 // LESSWRONG – bigUpvote
async function LWCommentsNewUpvoteOwnComment(comment) {
  var commentAuthor = Users.findOne(comment.userId);
  const votedComment = await performVoteServer({ document: comment, voteType: 'smallUpvote', collection: Comments, user: commentAuthor })
  return {...comment, ...votedComment};
}

addCallback('comments.new.after', LWCommentsNewUpvoteOwnComment);
